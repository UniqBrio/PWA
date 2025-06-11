// MongoDB setup script
import { MongoClient } from "mongodb"

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017"
const DB_NAME = "taskmanager"

async function setupDatabase() {
  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log("Connected to MongoDB")

    const db = client.db(DB_NAME)

    // Create collections with indexes
    await db.createCollection("tasks")
    await db.createCollection("subscriptions")

    // Create indexes
    await db.collection("tasks").createIndex({ createdAt: -1 })
    await db.collection("tasks").createIndex({ dueDate: 1 })
    await db.collection("tasks").createIndex({ completed: 1 })

    await db.collection("subscriptions").createIndex({ endpoint: 1 }, { unique: true })

    console.log("Database setup completed")

    // Insert sample data
    const sampleTasks = [
      {
        title: "Welcome to Task Manager",
        description: "This is your first task! Try creating more tasks and enabling notifications.",
        dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        completed: false,
        createdAt: new Date(),
      },
      {
        title: "Test notifications",
        description: "Enable push notifications to get reminders for your tasks",
        dueDate: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        completed: false,
        createdAt: new Date(),
      },
    ]

    await db.collection("tasks").insertMany(sampleTasks)
    console.log("Sample tasks inserted")
  } catch (error) {
    console.error("Database setup failed:", error)
  } finally {
    await client.close()
  }
}

setupDatabase()
