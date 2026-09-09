const Channel = require("../models/Channel");

// Turnocero's helper, adapted: NFD-normalize, strip diacritics, lowercase,
// collapse non-alphanumerics into hyphens, trim hyphens off the ends. The
// result feeds URLs and Socket.IO rooms so we can't allow spaces or weird
// characters.
function generateSlug(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Pick a unique slug by appending -2, -3, ... if needed.
async function pickUniqueSlug(baseInput) {
  const base = generateSlug(baseInput) || "canal";
  let candidate = base;
  let n = 2;
  // Loop bounded by DB uniqueness — no infinite risk since n increments.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await Channel.exists({ slug: candidate });
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
}

async function createChannelForUser(user) {
  const slug = await pickUniqueSlug(user.displayName || user.email.split("@")[0]);
  return Channel.create({
    slug,
    displayName: user.displayName,
    ownerUserId: user._id,
    enabledGames: ["the-crew"],
  });
}

module.exports = {
  generateSlug,
  pickUniqueSlug,
  createChannelForUser,
};
