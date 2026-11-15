import mongoose from "mongoose";

// One in-app notification for one student (shown in the bell at the top of the page).
//   ready    - the learning materials of a lecture are finished
//   failed   - processing of a lecture did not finish
//   weekly   - weekly study summary
//   security - something happened to the account (password changed, signed out everywhere...).
//              Always on: it is not one of the switches on the Account page.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["ready", "failed", "weekly", "security"], required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, default: "", trim: true, maxlength: 400 },
    // The lecture the notification is about (the bell links to it). Null for the weekly summary.
    lecture: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture", default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
// Old notifications remove themselves after 60 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default mongoose.model("Notification", notificationSchema);
