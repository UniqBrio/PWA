"use server"

import webpush from "web-push"
import connectDB from "@/lib/mongodb"
import Task, { type ITask } from "@/models/Task"
import Subscription from "@/models/Subscription"

// VAPID keys setup
webpush.setVapidDetails(
  "mailto:your-email@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    "BEl62iUYgUivxIkv69yViEuiBIa40HI2wLsHw4XloDiUnzSFvzIlSJRWaAcqP5h6HV6yJXxYJSQJbaYVpAidZis",
  process.env.VAPID_PRIVATE_KEY || "VCXEuSHQX6ueEB5ckbAPaEkX6cJhHQnuTjMOcHXldCo",
)

export async function subscribeUser(sub: PushSubscription) {
  try {
    await connectDB()

    const subscription = await Subscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: typeof sub.getKey === "function" ? Buffer.from(sub.getKey("p256dh")!).toString("base64") : undefined,
          auth: typeof sub.getKey === "function" ? Buffer.from(sub.getKey("auth")!).toString("base64") : undefined,
        },
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        lastUsed: new Date(),
        active: true,
      },
      { upsert: true, new: true },
    )

    console.log("Subscription saved:", subscription._id)
    return { success: true, id: subscription._id.toString() }
  } catch (error) {
    console.error("Error saving subscription:", error)
    return { success: false, error: "Failed to save subscription" }
  }
}

export async function unsubscribeUser(endpoint?: string) {
  try {
    await connectDB()

    if (endpoint) {
      await Subscription.findOneAndUpdate({ endpoint }, { active: false })
    } else {
      // Deactivate all subscriptions (fallback)
      await Subscription.updateMany({}, { active: false })
    }

    return { success: true }
  } catch (error) {
    console.error("Error removing subscription:", error)
    return { success: false, error: "Failed to remove subscription" }
  }
}

export async function sendNotification(message: string) {
  try {
    await connectDB()

    const activeSubscriptions = await Subscription.find({ active: true })

    if (activeSubscriptions.length === 0) {
      throw new Error("No active subscriptions available")
    }

    const notificationPayload = JSON.stringify({
      title: "Task Manager",
      body: message,
      icon: "/icons/icon-192x192.png", // Correct path to icon
      badge: "/icons/icon-96x96.png", // Correct path to badge icon (aligned with sw.js default)
      tag: "task-notification",
      data: {
        url: "/",
        timestamp: Date.now(),
      },
    })

    const sendPromises = activeSubscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          notificationPayload,
        )

        // Update last used timestamp
        subscription.lastUsed = new Date()
        await subscription.save()

        return { success: true, endpoint: subscription.endpoint }
      } catch (error) {
        console.error(`Failed to send notification to ${subscription.endpoint}:`, error)

        // Deactivate invalid subscriptions
        if (typeof error === "object" && error !== null && "statusCode" in error && (error as any).statusCode === 410) {
          subscription.active = false
          await subscription.save()
        }

        return { success: false, endpoint: subscription.endpoint, error }
      }
    })

    const results = await Promise.allSettled(sendPromises)
    const successful = results.filter((result) => result.status === "fulfilled" && result.value.success).length

    return {
      success: successful > 0,
      sent: successful,
      total: activeSubscriptions.length,
    }
  } catch (error) {
    console.error("Error sending push notifications:", error)
    return { success: false, error: "Failed to send notifications" }
  }
}

export async function createTask(taskData: {
  title: string
  description: string
  dueDate: string
  priority?: "low" | "medium" | "high"
  tags?: string[]
}) {
  try {
    await connectDB()

    const task = new Task({
      title: taskData.title,
      description: taskData.description,
      dueDate: new Date(taskData.dueDate),
      priority: taskData.priority || "medium",
      tags: taskData.tags || [],
    })

    await task.save()

    // Schedule notification for due date (simplified - in production use a job queue)
    const timeUntilDue = new Date(taskData.dueDate).getTime() - Date.now()
    if (timeUntilDue > 0 && timeUntilDue < 24 * 60 * 60 * 1000) {
      setTimeout(async () => {
        await sendNotification(`Task "${taskData.title}" is due now!`)
      }, timeUntilDue)
    }

    return {
      _id: (task._id as unknown as { toString: () => string }).toString(),
      title: task.title,
      description: task.description,
      dueDate: taskData.dueDate,
      completed: task.completed,
      priority: task.priority,
      tags: task.tags,
      createdAt: task.createdAt.toISOString(),
    }
  } catch (error) {
    console.error("Error creating task:", error)
    if (typeof error === "object" && error !== null && "name" in error && (error as any).name === "ValidationError") {
      const validationErrors = Object.values((error as any).errors).map((err) => (err as { message: string }).message)
      throw new Error(`Validation failed: ${validationErrors.join(", ")}`)
    }
    throw new Error("Failed to create task")
  }
}

export async function getTasks() {
  try {
    await connectDB()

    const tasks = await Task.find({}).sort({ createdAt: -1 }).lean()

    return tasks.map((task) => ({
      _id: (task._id as unknown as { toString: () => string }).toString(),
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate.toISOString().slice(0, 16),
      completed: task.completed,
      priority: task.priority,
      tags: task.tags || [],
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }))
  } catch (error) {
    console.error("Error fetching tasks:", error)
    return []
  }
}

export async function completeTask(taskId: string) {
  try {
    await connectDB()

    const task = await Task.findByIdAndUpdate(
      taskId,
      {
        completed: true,
        completedAt: new Date(),
      },
      { new: true },
    )

    if (!task) {
      throw new Error("Task not found")
    }

    // Send completion notification
    await sendNotification(`Task "${task.title}" has been completed! 🎉`)

    return { success: true, task: task.toObject() }
  } catch (error) {
    console.error("Error completing task:", error)
    throw new Error("Failed to complete task")
  }
}

export async function deleteTask(taskId: string) {
  try {
    await connectDB()

    const task = await Task.findByIdAndDelete(taskId)

    if (!task) {
      throw new Error("Task not found")
    }

    return { success: true }
  } catch (error) {
    console.error("Error deleting task:", error)
    throw new Error("Failed to delete task")
  }
}

export async function updateTask(taskId: string, updates: Partial<ITask>) {
  try {
    await connectDB()

    const task = await Task.findByIdAndUpdate(taskId, updates, { new: true, runValidators: true }) as ITask | null

    if (!task) {
      throw new Error("Task not found")
    }

    return {
      _id: (task._id as unknown as { toString: () => string }).toString(),
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate.toISOString().slice(0, 16),
      completed: task.completed,
      priority: task.priority,
      tags: task.tags || [],
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }
  } catch (error) {
    console.error("Error updating task:", error)
    if (typeof error === "object" && error !== null && "name" in error && (error as any).name === "ValidationError") {
      const validationErrors = Object.values((error as any).errors).map((err: any) => err.message)
      throw new Error(`Validation failed: ${validationErrors.join(", ")}`)
    }
    throw new Error("Failed to update task")
  }
}

export async function getTaskStats() {
  try {
    await connectDB()

    const stats = await Task.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: ["$completed", 1, 0] } },
          pending: { $sum: { $cond: ["$completed", 0, 1] } },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $lt: ["$dueDate", new Date()] }, { $eq: ["$completed", false] }] }, 1, 0],
            },
          },
        },
      },
    ])

    return stats[0] || { total: 0, completed: 0, pending: 0, overdue: 0 }
  } catch (error) {
    console.error("Error fetching task stats:", error)
    return { total: 0, completed: 0, pending: 0, overdue: 0 }
  }
}
