// <== IMPORTS ==>
import {
  Strategy as GitHubStrategy,
  Profile as GitHubProfile,
} from "passport-github2";
import {
  Strategy as GoogleStrategy,
  Profile as GoogleProfile,
} from "passport-google-oauth20";
import passport from "passport";
import { User } from "../models/user.model.js";
import { VerifyCallback } from "passport-oauth2";

// <== USER TYPE FOR PASSPORT ==>
interface PassportUser {
  // <== _ID FIELD ==>
  _id: string | { toString(): string };
  // <== EMAIL FIELD ==>
  email: string;
  // <== NAME FIELD ==>
  name: string;
  // <== PROVIDER FIELD ==>
  provider?: string | null;
  // <== PROVIDER ID FIELD ==>
  providerId?: string | null;
  // <== PROVIDER EMAIL FIELD ==>
  [key: string]: unknown;
}

// <== GOOGLE OAUTH STRATEGY ==>
// ONLY INITIALIZE IF CREDENTIALS ARE PROVIDED
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    // <== NEW GOOGLE STRATEGY ==>
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:
          process.env.GOOGLE_CALLBACK_URL || "/api/v1/auth/google/callback",
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: GoogleProfile,
        done: VerifyCallback
      ) => {
        try {
          // VALIDATE REQUIRED PROFILE DATA
          if (!profile.id || !profile.emails?.[0]?.value) {
            return done(
              new Error("Missing required profile information"),
              undefined
            );
          }
          // FIND USER BY PROVIDER ID OR EMAIL
          let user = await User.findOne({
            $or: [
              { provider: "google", providerId: profile.id },
              { email: profile.emails[0].value },
            ],
          })
            .lean()
            .exec();
          // IF USER EXISTS
          if (user) {
            // IF USER EXISTS BUT NOT WITH GOOGLE PROVIDER, UPDATE IT
            if (user.provider !== "google") {
              await User.updateOne(
                { _id: user._id },
                {
                  provider: "google",
                  providerId: profile.id,
                  providerEmail: profile.emails[0].value,
                }
              ).exec();
              // UPDATE USER OBJECT
              user = { ...user, provider: "google", providerId: profile.id };
            }
            // RETURN USER (CONVERT _ID TO STRING IF NEEDED)
            const passportUser: PassportUser = {
              ...user,
              _id:
                typeof user._id === "string" ? user._id : user._id.toString(),
            };
            return done(null, passportUser);
          }
          // CREATE NEW USER
          const newUser = await User.create({
            name: profile.displayName || profile.name?.givenName || "User",
            email: profile.emails[0].value,
            provider: "google",
            providerId: profile.id,
            providerEmail: profile.emails[0].value,
            profilePic: profile.photos?.[0]?.value || "",
          });
          // RETURN NEW USER (CONVERT TO PLAIN OBJECT AND ENSURE _ID IS STRING)
          const userObject = newUser.toObject();
          const passportUser: PassportUser = {
            ...userObject,
            _id:
              typeof userObject._id === "string"
                ? userObject._id
                : userObject._id.toString(),
          };
          return done(null, passportUser);
        } catch (error) {
          // RETURN ERROR
          const err =
            error instanceof Error
              ? error
              : new Error("Unknown error occurred");
          return done(err, undefined);
        }
      }
    )
  );
} else {
  console.warn(
    "⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable."
  );
}
// <== GITHUB OAUTH STRATEGY ==>
// ONLY INITIALIZE IF CREDENTIALS ARE PROVIDED
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    // <== NEW GITHUB STRATEGY ==>
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL:
          process.env.GITHUB_CALLBACK_URL || "/api/v1/auth/github/callback",
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: GitHubProfile,
        done: VerifyCallback
      ) => {
        try {
          // VALIDATE REQUIRED PROFILE DATA
          if (!profile.id || !profile.username) {
            return done(
              new Error("Missing required profile information"),
              undefined
            );
          }
          // GET EMAIL FROM PROFILE OR USE GITHUB NOREPLY EMAIL
          const email =
            profile.emails?.[0]?.value || `${profile.username}@github.noreply`;
          const displayName = profile.displayName || profile.username || "User";
          // FIND USER BY PROVIDER ID OR EMAIL
          let user = await User.findOne({
            $or: [
              { provider: "github", providerId: profile.id.toString() },
              { email: email },
            ],
          })
            .lean()
            .exec();
          // IF USER EXISTS
          if (user) {
            // IF USER EXISTS BUT NOT WITH GITHUB PROVIDER, UPDATE IT
            if (user.provider !== "github") {
              await User.updateOne(
                { _id: user._id },
                {
                  provider: "github",
                  providerId: profile.id.toString(),
                  providerEmail: email,
                }
              ).exec();
              // UPDATE USER OBJECT
              user = {
                ...user,
                provider: "github",
                providerId: profile.id.toString(),
              };
            }
            // RETURN USER (CONVERT _ID TO STRING IF NEEDED)
            const passportUser: PassportUser = {
              ...user,
              _id:
                typeof user._id === "string" ? user._id : user._id.toString(),
            };
            return done(null, passportUser);
          }
          // CREATE NEW USER
          const newUser = await User.create({
            name: displayName,
            email: email,
            provider: "github",
            providerId: profile.id.toString(),
            providerEmail: email,
            profilePic: profile.photos?.[0]?.value || "",
          });
          // RETURN NEW USER (CONVERT TO PLAIN OBJECT AND ENSURE _ID IS STRING)
          const userObject = newUser.toObject();
          const passportUser: PassportUser = {
            ...userObject,
            _id:
              typeof userObject._id === "string"
                ? userObject._id
                : userObject._id.toString(),
          };
          return done(null, passportUser);
        } catch (error) {
          // RETURN ERROR
          const err =
            error instanceof Error
              ? error
              : new Error("Unknown error occurred");
          return done(err, undefined);
        }
      }
    )
  );
} else {
  console.warn(
    "⚠️  GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable."
  );
}
// <== SERIALIZE USER ==>
passport.serializeUser((user: unknown, done) => {
  // TYPE GUARD AND CONVERT _ID TO STRING FOR SERIALIZATION
  const passportUser = user as PassportUser;
  // CONVERT _ID TO STRING FOR SERIALIZATION
  const userId =
    typeof passportUser._id === "string"
      ? passportUser._id
      : passportUser._id.toString();
  // RETURN USER ID
  done(null, userId);
});
// <== DESERIALIZE USER ==>
passport.deserializeUser(async (id: string, done) => {
  // TRY TO FIND USER BY ID
  try {
    // FIND USER BY ID
    const user = await User.findById(id).lean().exec();
    // IF USER NOT FOUND, RETURN ERROR
    if (!user) {
      return done(new Error("User not found"), undefined);
    }
    // CONVERT _ID TO STRING FOR PASSPORT USER
    const passportUser: PassportUser = {
      ...user,
      _id: typeof user._id === "string" ? user._id : user._id.toString(),
    };
    // RETURN PASSPORT USER
    done(null, passportUser);
  } catch (error) {
    // RETURN ERROR
    const err =
      error instanceof Error ? error : new Error("Unknown error occurred");
    // RETURN ERROR
    done(err, undefined);
  }
});

export default passport;
