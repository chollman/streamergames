const {
  generateSlug,
  pickUniqueSlug,
  createChannelForUser,
} = require("../../../services/channels");
const Channel = require("../../../models/Channel");
const User = require("../../../models/User");

describe("services/channels — generateSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(generateSlug("Claudio Hollman")).toBe("claudio-hollman");
  });

  it("strips diacritics", () => {
    expect(generateSlug("Océanos de Papel")).toBe("oceanos-de-papel");
  });

  it("collapses runs of non-alphanumerics", () => {
    expect(generateSlug("My  Cool -- Channel!!")).toBe("my-cool-channel");
  });

  it("trims leading/trailing hyphens", () => {
    expect(generateSlug("---foo---")).toBe("foo");
  });

  it("returns empty string for garbage input", () => {
    expect(generateSlug("!!!!!")).toBe("");
    expect(generateSlug("")).toBe("");
    expect(generateSlug(null)).toBe("");
  });
});

describe("services/channels — pickUniqueSlug", () => {
  it("returns the base slug when free", async () => {
    const slug = await pickUniqueSlug("Claudio");
    expect(slug).toBe("claudio");
  });

  it("falls back to 'canal' when the base is empty", async () => {
    const slug = await pickUniqueSlug("!!!");
    expect(slug).toBe("canal");
  });

  it("appends -2, -3, ... on collisions", async () => {
    const user = await User.create({ email: "u@x.com", password: "hash", displayName: "u" });
    await Channel.create({ slug: "claudio", displayName: "c", ownerUserId: user._id });
    const s1 = await pickUniqueSlug("Claudio");
    expect(s1).toBe("claudio-2");
    await Channel.create({ slug: "claudio-2", displayName: "c", ownerUserId: user._id });
    const s2 = await pickUniqueSlug("Claudio");
    expect(s2).toBe("claudio-3");
  });
});

describe("services/channels — createChannelForUser", () => {
  it("creates a channel owned by the user with the-crew enabled", async () => {
    const user = await User.create({
      email: "streamer@x.com",
      password: "hash",
      displayName: "Streamer One",
    });
    const channel = await createChannelForUser(user);
    expect(channel.slug).toBe("streamer-one");
    expect(channel.displayName).toBe("Streamer One");
    expect(channel.ownerUserId.toString()).toBe(user._id.toString());
    expect(channel.enabledGames).toEqual(["the-crew"]);
  });
});
