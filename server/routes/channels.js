const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const protect = require("../middleware/protect");
const httpError = require("../utils/httpError");
const Channel = require("../models/Channel");
const {
  createSessionForStreamer,
  getActiveSessionForChannel,
  abandonAllActiveSessionsForChannel,
} = require("../services/sessions");

const router = express.Router();

// Create a session on the caller's own channel. Only the channel's owner
// can do this — the frontend never asks the user to pick a channel; there's
// exactly one per streamer at MVP. The service refuses (409) if the channel
// already has an active session.
router.post(
  "/:slug/sessions",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await createSessionForStreamer({
      channel,
      streamerUser: req.user,
      gameId: req.body && req.body.gameId,
    });
    res.status(201).json({ session });
  })
);

// Return the channel's currently active session (lobby or in_progress),
// or 204 if there is none. Only the channel owner can call this — the
// dashboard uses it to decide whether to show "Continue" or "Create".
router.get(
  "/:slug/sessions/active",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const session = await getActiveSessionForChannel(channel._id);
    if (!session) return res.status(204).end();
    res.json({ session });
  })
);

// Bulk-abandon: closes every lobby / in_progress session on the channel.
// The dashboard's "cancel and create new" button hits this before creating
// so a channel with residual lobbies (created before the per-channel guard
// existed, or from a bug) can still be recovered in one click.
router.post(
  "/:slug/sessions/abandon-active",
  protect,
  asyncHandler(async (req, res) => {
    const channel = await Channel.findOne({ slug: req.params.slug });
    if (!channel) throw httpError(404, req.t("errors:not_found"), { code: "channel_not_found" });
    if (channel.ownerUserId.toString() !== req.user._id.toString()) {
      throw httpError(403, req.t("errors:forbidden"), { code: "not_owner" });
    }
    const result = await abandonAllActiveSessionsForChannel({
      channel,
      streamerUser: req.user,
    });
    res.json(result);
  })
);

module.exports = router;
