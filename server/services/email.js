// MVP stub: log to server console. In F4 we swap this for Resend or another
// provider (see turnocero's server/utils/email.js for the pattern).
// eslint-disable-next-line no-console
const log = (...args) => console.log("[email]", ...args);

async function sendVerificationEmail({ email, code }) {
  log(`verification code for ${email}: ${code}`);
}

async function sendPasswordResetEmail({ email, token }) {
  log(`password reset token for ${email}: ${token}`);
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};
