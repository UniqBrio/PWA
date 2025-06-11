import mongoose, { type Document, Schema } from "mongoose"

export interface ITask extends Document {
  title: string
  description?: string
  dueDate: Date
  completed: boolean
  createdAt: Date
  completedAt?: Date
  priority: "low" | "medium" | "high"
  tags: string[]
}

const TaskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
      validate: {
        validator: (date: Date) => date > new Date(),
        message: "Due date must be in the future",
      },
    },
    completed: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Middleware to set completedAt when task is marked as completed
TaskSchema.pre("save", function (next) {
  if (this.isModified("completed") && this.completed && !this.completedAt) {
    this.completedAt = new Date()
  }
  next()
})

// Index for efficient queries
TaskSchema.index({ createdAt: -1 })
TaskSchema.index({ dueDate: 1 })
TaskSchema.index({ completed: 1 })
TaskSchema.index({ priority: 1 })

export default mongoose.models.Task || mongoose.model<ITask>("Task", TaskSchema)
