const mongoose = require("mongoose");
const { Schema } = mongoose;

// Multi-tenant primitive from day 1 (docs/architecture.md §2.1). One channel
// per streamer at MVP; the model already carries what F5 needs so we don't
// re-shape it later.
const ChannelSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      immutable: true, // becomes part of URLs and Socket.IO rooms — never change
      index: true,
    },
    displayName: { type: String, required: true, trim: true },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    twitchChannelId: { type: String, sparse: true, index: true },
    enabledGames: { type: [String], default: ["the-crew"] },
    skin: {
      accents: {
        primary: String,
        secondary: String,
        accent: String,
      },
      brandName: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Channel", ChannelSchema);
