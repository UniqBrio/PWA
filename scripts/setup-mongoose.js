// Mongoose setup script for MongoDB Atlas
import mongoose from "mongoose"
import Task from "../models/Task.js"
import Subscription from "../models/Subscription.js"

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/taskmanager"

async function setupDatabase() {
  try {
    // Connect to MongoDB Atlas
    await mongoose.connect(MONGODB_URI)
    console.log("Connected to MongoDB Atlas")

    // Clear existing data (optional - remove in production)
    await Task.deleteMany({})
    await Subscription.deleteMany({})
    console.log("Cleared existing data")

    // Create sample tasks
    const sampleTasks = [
      {
        title: "Welcome to Task Manager PWA",
        description: "This is your first task! Try creating more tasks and enabling notifications.",
        dueDate: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        priority: "high",
        tags: ["welcome", "demo"],
      },
      {
        title: "Test push notifications",
        description: "Enable push notifications to get reminders for your tasks",
        dueDate: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        priority: "medium",
        tags: ["notifications", "test"],
      },
      {
        title: "Explore PWA features",
        description: "Try installing this app on your home screen and test offline functionality",
        dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        priority: "low",
        tags: ["pwa", "features"],
      },
    ]

    const createdTasks = await Task.insertMany(sampleTasks)
    console.log(`Created ${createdTasks.length} sample tasks`)

    // Display task statistics
    const stats = await Task.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byPriority: {
            $push: {
              priority: "$priority",
              count: 1,
            },
          },
        },
      },
    ])

    console.log("Database setup completed successfully!")
    console.log("Task statistics:", stats[0])
  } catch (error) {
    console.error("Database setup failed:", error)
  } finally {
    await mongoose.connection.close()
    console.log("Database connection closed")
  }
}

setupDatabase()
