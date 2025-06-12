"use server"

import webpush from "web-push"
import connectDB from "@/lib/mongodb"
import Task, { type ITask } from "@/models/Task"
import Subscription from "@/models/Subscription"

// VAPID keys setup
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BEl62iUYgUivxIkv69yViEuiBIa40HI2wLsHw4XloDiUnzSFvzIlSJRWaAcqP5h6HV6yJXxYJSQJbaYVpAidZis";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "VCXEuSHQX6ueEB5ckbAPaEkX6cJhHQnuTjMOcHXldCo";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID keys are not configured. Push notifications will not work.");
}

// VAPID keys setup
webpush.setVapidDetails(
  "mailto:uniqbrio@gmail.com", // Replace with your actual contact email
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Log VAPID key status (especially useful for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log("VAPID Public Key (first 10 chars):", VAPID_PUBLIC_KEY.substring(0, 10));
  console.log(
    "VAPID Private Key:",
    VAPID_PRIVATE_KEY === "VCXEuSHQX6ueEB5ckbAPaEkX6cJhHQnuTjMOcHXldCo" ? "Using default fallback (ensure this is intended for dev only)" : "Using environment variable"
  );
}

// Define a type for the structured notification payload data
interface NotificationPayloadInput {
  type: 'task_created' | 'task_completed' | 'task_deleted' | 'task_due' | 'test_message';
  task?: { _id: string; title: string; /* other relevant task fields can be added here */ };
  message?: string; // For test messages or generic messages
  // Add other potential properties as needed for different notification types
}

export async function subscribeUser(sub: PushSubscription) {
  try {
    await connectDB()
    const p256dhKey = typeof sub.getKey === "function" ? sub.getKey("p256dh") : null;
    const authKey = typeof sub.getKey === "function" ? sub.getKey("auth") : null;

    const subscription = await Subscription.findOneAndUpdate(
      { endpoint: sub.endpoint },
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: p256dhKey ? Buffer.from(p256dhKey).toString("base64") : undefined,
          auth: authKey ? Buffer.from(authKey).toString("base64") : undefined,
        },
        // Note: `navigator.userAgent` will be undefined here as this is server-side code.
        // If userAgent is needed for analytics or debugging, it should be passed from the client.
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
      // WARNING: Deactivates ALL subscriptions in the database.
      // This branch is hit if `unsubscribeUser` is called without an endpoint.
      // Ensure this is the intended behavior for such calls.
      console.warn("Deactivating ALL subscriptions as no specific endpoint was provided to unsubscribeUser.");
      await Subscription.updateMany({}, { active: false });
    }

    return { success: true }
  } catch (error) {
    console.error("Error removing subscription:", error)
    return { success: false, error: "Failed to remove subscription" }
  }
}

export async function sendNotification(payloadData: NotificationPayloadInput) {
  console.log(`[sendNotification] Received request with type: ${payloadData.type}`, payloadData.task ? `for task ID: ${payloadData.task._id}` : (payloadData.message ? `with message: ${payloadData.message}`: ""));
  try {
    await connectDB()

    const activeSubscriptions = await Subscription.find({ active: true })
    console.log(`[sendNotification] Found ${activeSubscriptions.length} active subscription(s).`);

    if (activeSubscriptions.length === 0) {
      console.warn("[sendNotification] No active subscriptions found to send notifications to.");
      return { success: false, error: "No active subscriptions available", sent: 0, total: 0 };
    }

    // Ensure task data is present when expected
    if (['task_created', 'task_completed', 'task_deleted', 'task_due'].includes(payloadData.type) && !payloadData.task) {
        console.error(`[sendNotification] Task data is missing for notification type: ${payloadData.type}`);
        throw new Error(`Task data missing for ${payloadData.type} notification`);
    }

    let notificationPayloadContent: {
      title: string;
      body: string;
      icon: string;
      badge: string;
      tag: string;
      data: {
        url: string;
        timestamp: number;
        [key: string]: any; // Allow other custom data
      };
    };

    // Construct notificationPayloadContent based on payloadData.type
    switch (payloadData.type) {
      case 'task_created':
        notificationPayloadContent = {
          title: 'Task Created!',
          body: `New task: "${payloadData.task!.title}" has been added.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: `task-created-${payloadData.task!._id}`,
          data: {
            url: `/tasks/${payloadData.task?._id}`, // Assuming you might have a page like /tasks/[taskId]
            timestamp: Date.now(),
            taskId: payloadData.task?._id,
          },
        };
        break;
      case 'task_completed':
        notificationPayloadContent = {
          title: 'Task Completed! 🎉',
          body: `Task "${payloadData.task!.title}" has been marked as complete.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: `task-completed-${payloadData.task!._id}`,
          data: {
            url: `/tasks/${payloadData.task?._id}`,
            timestamp: Date.now(),
            taskId: payloadData.task?._id,
          },
        };
        break;
      case 'task_deleted':
        notificationPayloadContent = {
          title: 'Task Deleted',
          body: `Task "${payloadData.task?.title ?? ''}" has been removed.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: `task-deleted-${payloadData.task?. _id ?? ''}`, // Use task._id to ensure tag uniqueness if needed
          data: {
            url: `/tasks`, // Or a relevant URL, like the main task list
            timestamp: Date.now(),
          },
        };
        break;
      case 'task_due':
        notificationPayloadContent = {
          title: 'Task Due!',
          body: `Reminder: Task "${payloadData.task?.title ?? ''}" is due.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: `task-due-${payloadData.task?._id ?? ''}`,
          data: {
            url: `/tasks/${payloadData.task?._id}`,
            timestamp: Date.now(),
            taskId: payloadData.task?._id,
          },
        };
        break;
      case 'test_message':
        notificationPayloadContent = {
          title: 'Test Notification',
          body: payloadData.message || 'This is a test notification.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'test-notification',
          data: {
            url: '/', // Default URL for test
            timestamp: Date.now(),
          },
        };
        break;
      default:
        // Fallback for unknown types
        console.warn(`Unhandled notification type: ${(payloadData as any).type}`);
        notificationPayloadContent = {
          title: 'Task Manager Update',
          body: payloadData.message || 'You have a new update.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: 'generic-notification',
          data: {
            url: '/',
            timestamp: Date.now(),
          },
        };
    }

    console.log("[sendNotification] Constructed notification content:", JSON.stringify(notificationPayloadContent));
    const finalNotificationPayload = JSON.stringify(notificationPayloadContent);

    const sendPromises = activeSubscriptions.map(async (subscription) => {
      try {
        const sendResult = await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
          },
          finalNotificationPayload,
        )

        console.log(`[sendNotification] Successfully sent notification to endpoint: ${subscription.endpoint.substring(0,50)}... Status: ${sendResult.statusCode}`);
        // Update last used timestamp
        subscription.lastUsed = new Date()
        await subscription.save()

        return { success: true, endpoint: subscription.endpoint }
      } catch (error: any) {
        console.error(`[sendNotification] Failed to send to ${subscription.endpoint.substring(0,50)}... Error: ${error.message}`, error);

        // Deactivate invalid subscriptions
        // Common status codes indicating an expired or invalid subscription:
        // 400 Bad Request (sometimes used for malformed requests or invalid VAPID)
        // 401 Unauthorized (VAPID issues)
        // 403 Forbidden (VAPID issues or other permission problems)
        // 404 Not Found (endpoint no longer exists)
        // 410 Gone (endpoint permanently gone)
        if (error.statusCode && [400, 401, 403, 404, 410].includes(error.statusCode)) {
          console.log(`[sendNotification] Deactivating subscription for endpoint ${subscription.endpoint.substring(0,50)}... due to status code ${error.statusCode}.`);
          subscription.active = false;
          await subscription.save();
        }
        return { success: false, endpoint: subscription.endpoint, error: { message: error.message, statusCode: error.statusCode, body: error.body } };
      }
    })

    const results = await Promise.allSettled(sendPromises)
    const successfulSends = results.filter((result) => result.status === "fulfilled" && result.value.success).length;
    console.log(`[sendNotification] Finished sending. Successful: ${successfulSends}/${activeSubscriptions.length}`);

    return {
      success: successfulSends > 0,
      sent: successfulSends,
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

    // Send immediate "task created" notification
    await sendNotification({
      type: 'task_created',
      task: { _id: task._id.toString(), title: task.title }
    });

    // Schedule notification for due date (simplified - in production use a job queue)
    const timeUntilDue = new Date(taskData.dueDate).getTime() - Date.now()
    // Only schedule if due within a reasonable future window (e.g., 24 hours) to avoid long-held timeouts.
    if (timeUntilDue > 0 && timeUntilDue < 24 * 60 * 60 * 1000) { 
      // IMPORTANT: `setTimeout` is NOT reliable for production environments for scheduling tasks.
      // If the server restarts, these scheduled timeouts will be lost.
      // For robust scheduling, use a proper job queue system (e.g., BullMQ, Agenda.js, or cloud-native schedulers).
      setTimeout(async () => {
        await sendNotification({
          type: 'task_due',
          task: { _id: task._id.toString(), title: task.title }
        });
      }, timeUntilDue)
    }
    return {
      _id: (task._id as any).toString(),
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
 _id: (task._id as any).toString(),
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
    await sendNotification({
      type: 'task_completed',
      task: { _id: task._id.toString(), title: task.title }
    });

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

    // Send "task deleted" notification
    await sendNotification({
      type: 'task_deleted',
      task: { _id: task._id.toString(), title: task.title } // Send task title for context in notification
    });

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
      _id: (task._id as any).toString(),
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
