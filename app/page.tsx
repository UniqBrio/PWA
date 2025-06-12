"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Bell, Plus, Check, Clock } from "lucide-react"
import {
  subscribeUser,
  unsubscribeUser,
  sendNotification,
  createTask,
  getTasks,
  completeTask,
  deleteTask,
  getTaskStats,
} from "./actions"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

interface Task {
  _id: string
  title: string
  description: string
  dueDate: string
  completed: boolean
  priority: "low" | "medium" | "high"
  tags: string[]
  createdAt: string
  completedAt?: string
}

function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true)
      registerServiceWorker()
    }
  }, [])

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      const sub = await registration.pushManager.getSubscription()
      setSubscription(sub)
    } catch (error) {
      console.error("Service worker registration failed:", error)
    }
  }

  async function subscribeToPush() {
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
            "BEl62iUYgUivxIkv69yViEuiBIa40HI2wLsHw4XloDiUnzSFvzIlSJRWaAcqP5h6HV6yJXxYJSQJbaYVpAidZis",
        ),
      })
      setSubscription(sub)
      const serializedSub = JSON.parse(JSON.stringify(sub))
      await subscribeUser(serializedSub)
    } catch (error) {
      console.error("Push subscription failed:", error)
    }
  }

  async function unsubscribeFromPush() {
    try {
      await subscription?.unsubscribe()
      setSubscription(null)
      // Pass the endpoint of the specific subscription to be deactivated
      if (subscription?.endpoint) {
        await unsubscribeUser(subscription.endpoint)
      }
      // If you still want a way to "unsubscribe all" from a UI, it should be a separate, explicit action.
    } catch (error) {
      console.error("Unsubscribe failed:", error)
    }
  }

  async function sendTestNotification() {
    if (subscription && message) {
      await sendNotification({ type: "test_message", message })
      setMessage("")
    }
  }

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>Push notifications are not supported in this browser.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          {subscription ? "You are subscribed to push notifications." : "Enable notifications to get task reminders."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {subscription ? (
          <>
            <Button onClick={unsubscribeFromPush} variant="outline" className="w-full">
              Unsubscribe from Notifications
            </Button>
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Enter test notification message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button onClick={sendTestNotification} className="w-full" disabled={!message}>
                Send Test Notification
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={subscribeToPush} className="w-full">
            Enable Notifications
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function TaskManager() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    dueDate: "",
    priority: "medium" as "low" | "medium" | "high",
    tags: "",
  })
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, overdue: 0 })

  useEffect(() => {
    loadTasks()
    loadStats()
  }, [])

  async function loadTasks() {
    try {
      const fetchedTasks = await getTasks()
      setTasks(fetchedTasks)
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      const taskStats = await getTaskStats()
      setStats(taskStats)
    } catch (error) {
      console.error("Failed to load stats:", error)
    }
  }

  async function handleCreateTask() {
    if (!newTask.title || !newTask.dueDate) return

    try {
      const task = await createTask({
        ...newTask,
        tags: newTask.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      setTasks([task, ...tasks])
      setNewTask({ title: "", description: "", dueDate: "", priority: "medium", tags: "" })
      await loadStats()
      // The `createTask` server action already sends a notification.
      // Calling sendNotification here would be redundant.
    } catch (error) {
      console.error("Failed to create task:", error)
      alert("Failed to create task. Please check your input.")
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      await completeTask(taskId)
      setTasks(tasks.map((task) => (task._id === taskId ? { ...task, completed: true } : task)))
      await loadStats()
    } catch (error) {
      console.error("Failed to complete task:", error)
    }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await deleteTask(taskId)
      setTasks(tasks.filter((task) => task._id !== taskId))
      await loadStats()
    } catch (error) {
      console.error("Failed to delete task:", error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const isOverdue = (dueDate: string, completed: boolean) => {
    return new Date(dueDate) < new Date() && !completed
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
      default:
        return "default"
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading tasks...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle>Task Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <div className="text-sm text-muted-foreground">Overdue</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Task Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Task
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Task title"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
          />
          <Input
            placeholder="Description (optional)"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="datetime-local"
              value={newTask.dueDate}
              onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
            />
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as "low" | "medium" | "high" })}
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>
          </div>
          <Input
            placeholder="Tags (comma separated)"
            value={newTask.tags}
            onChange={(e) => setNewTask({ ...newTask, tags: e.target.value })}
          />
          <Button onClick={handleCreateTask} className="w-full" disabled={!newTask.title || !newTask.dueDate}>
            Create Task
          </Button>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Tasks</h2>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No tasks yet. Create your first task above!
            </CardContent>
          </Card>
        ) : (
          tasks.map((task) => (
            <Card key={task._id} className={task.completed ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className={task.completed ? "line-through" : ""}>{task.title}</CardTitle>
                    {task.description && <CardDescription>{task.description}</CardDescription>}
                    {task.tags && task.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {task.tags.map((tag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getPriorityColor(task.priority)}>{task.priority}</Badge>
                    {task.completed ? (
                      <Badge variant="secondary">
                        <Check className="w-3 h-3 mr-1" />
                        Completed
                      </Badge>
                    ) : isOverdue(task.dueDate, task.completed) ? (
                      <Badge variant="destructive">
                        <Clock className="w-3 h-3 mr-1" />
                        Overdue
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Due: {formatDate(task.dueDate)}</span>
                  <div className="flex gap-2">
                    {!task.completed && (
                      <Button size="sm" onClick={() => handleCompleteTask(task._id)}>
                        Mark Complete
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteTask(task._id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Task Manager PWA</h1>
          <p className="text-muted-foreground">A Progressive Web App with push notifications</p>
        </div>

        <PushNotificationManager />
        <TaskManager />
      </div>
    </div>
  )
}
