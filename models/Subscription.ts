import mongoose, { type Document, Schema } from "mongoose"

export interface ISubscription extends Document {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string
  createdAt: Date
  lastUsed: Date
  active: boolean
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    endpoint: {
      type: String,
      required: [true, "Endpoint is required"],
      unique: true,
    },
    keys: {
      p256dh: {
        type: String,
        required: [true, "p256dh key is required"],
      },
      auth: {
        type: String,
        required: [true, "auth key is required"],
      },
    },
    userAgent: {
      type: String,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Index for efficient queries
SubscriptionSchema.index({ endpoint: 1 })
SubscriptionSchema.index({ active: 1 })
SubscriptionSchema.index({ createdAt: -1 })

export default mongoose.models.Subscription || mongoose.model<ISubscription>("Subscription", SubscriptionSchema)
