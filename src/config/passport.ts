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
import { encryptSecret } from "../utils/encryption.js";
import { Workspace } from "../models/workspace.model.js";

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
  providerEmail?: string | null;
  // <== GITHUB USERNAME FIELD ==>
  githubUsername?: string | null;
  // <== GITHUB CONNECTED AT FIELD ==>
  githubConnectedAt?: Date | null;
  // <== GITHUB SCOPES FIELD ==>
  githubScopes?: string[];
  // <== ADDITIONAL FIELDS ==>
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
        _accessToken: string,
        _refreshToken: string,
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
            } else if (user.providerId === profile.id) {
              // SYNC PROVIDER EMAIL WITH OAUTH PROVIDER'S EMAIL
              if (profile.emails[0].value !== user.providerEmail) {
                // UPDATE PROVIDER EMAIL TO MATCH OAUTH PROVIDER'S EMAIL
                await User.updateOne(
                  { _id: user._id },
                  { providerEmail: profile.emails[0].value }
                ).exec();
                // UPDATE USER OBJECT
                user = { ...user, providerEmail: profile.emails[0].value };
              }
              // SYNC USER EMAIL WITH OAUTH PROVIDER'S EMAIL IF IT IS DIFFERENT
              if (user.email !== profile.emails[0].value) {
                // UPDATE USER EMAIL TO MATCH OAUTH PROVIDER'S EMAIL
                await User.updateOne(
                  { _id: user._id },
                  { email: profile.emails[0].value }
                ).exec();
                // UPDATE USER OBJECT
                user = { ...user, email: profile.emails[0].value };
              }
            }
            // RETURN USER (CONVERT _ID TO STRING IF NEEDED)
            const passportUser: PassportUser = {
              _id:
                typeof user._id === "string" ? user._id : user._id.toString(),
              email: user.email,
              name: user.name,
              provider: user.provider,
              providerId: user.providerId,
              providerEmail: user.providerEmail,
            };
            return done(null, passportUser);
          }
          // IF EMAIL WAS PREVIOUSLY USED (VIA PROVIDER EMAIL) TO PREVENT DUPLICATES, RETURN ERROR
          const existingUserWithProviderEmail = await User.findOne({
            providerEmail: profile.emails[0].value,
          })
            .lean()
            .exec();
          if (existingUserWithProviderEmail) {
            // RETURNING ERROR RESPONSE
            return done(
              new Error(
                `This email address was previously associated with another account. Please use your original OAuth account to log in.`
              ),
              undefined
            );
          }
          // CREATE NEW USER
          const userName =
            profile.displayName || profile.name?.givenName || "User";
          const newUser = await User.create({
            name: userName,
            email: profile.emails[0].value,
            provider: "google",
            providerId: profile.id,
            providerEmail: profile.emails[0].value,
            profilePic: profile.photos?.[0]?.value || "",
          });
          // CREATE PERSONAL WORKSPACE FOR THE NEW USER
          const personalWorkspace = await Workspace.create({
            name: `${userName}'s Space`,
            description:
              "Your personal workspace for individual tasks and projects",
            visibility: "system",
            type: "personal",
            ownerId: newUser._id,
          });
          // UPDATE USER WITH PERSONAL WORKSPACE ID
          await User.findByIdAndUpdate(newUser._id, {
            personalWorkspaceId: personalWorkspace._id,
          });
          // RETURN NEW USER (CONVERT TO PLAIN OBJECT AND ENSURE _ID IS STRING)
          const userObject = newUser.toObject();
          // RETURNING PASSPORT USER
          const passportUser: PassportUser = {
            ...userObject,
            _id:
              typeof userObject._id === "string"
                ? userObject._id
                : userObject._id.toString(),
          };
          // RETURNING PASSPORT USER
          return done(null, passportUser);
        } catch (error) {
          // RETURNING ERROR RESPONSE
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
        _refreshToken: string,
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
          // GET DISPLAY NAME FROM PROFILE OR USE DEFAULT
          const displayName = profile.displayName || profile.username || "User";
          // ENCRYPT THE GITHUB ACCESS TOKEN FOR SECURE STORAGE
          const encryptedAccessToken = encryptSecret(accessToken);
          // GITHUB SCOPES THAT WERE REQUESTED (DEFINED IN AUTH ROUTE)
          const githubScopes = ["user:email", "read:user", "repo"];
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
                  // STORE GITHUB ACCESS TOKEN AND METADATA
                  githubAccessToken: encryptedAccessToken,
                  githubUsername: profile.username,
                  githubConnectedAt: new Date(),
                  githubScopes: githubScopes,
                }
              ).exec();
              // UPDATE USER OBJECT
              user = {
                ...user,
                provider: "github",
                providerId: profile.id.toString(),
                githubUsername: profile.username,
                githubConnectedAt: new Date(),
                githubScopes: githubScopes,
              };
            } else if (user.providerId === profile.id.toString()) {
              // SYNC PROVIDER EMAIL WITH OAUTH PROVIDER'S EMAIL IF IT IS DIFFERENT
              // AND UPDATE GITHUB ACCESS TOKEN (TOKEN REFRESH ON EACH LOGIN)
              const updateFields: Record<string, unknown> = {
                githubAccessToken: encryptedAccessToken,
                githubUsername: profile.username,
                githubScopes: githubScopes,
              };
              if (email !== user.providerEmail) {
                updateFields.providerEmail = email;
              }
              if (user.email !== email) {
                updateFields.email = email;
              }
              // SET GITHUB CONNECTED AT IF NOT ALREADY SET
              if (!user.githubConnectedAt) {
                updateFields.githubConnectedAt = new Date();
              }
              // UPDATE USER IN DATABASE
              await User.updateOne({ _id: user._id }, updateFields).exec();
              // UPDATE USER OBJECT WITH NEW VALUES
              const updatedEmail =
                typeof updateFields.email === "string"
                  ? updateFields.email
                  : user.email;
              const updatedProviderEmail =
                typeof updateFields.providerEmail === "string"
                  ? updateFields.providerEmail
                  : user.providerEmail;
              user = {
                ...user,
                ...updateFields,
                email: updatedEmail,
                providerEmail: updatedProviderEmail,
              };
            }
            // RETURN USER (CONVERT _ID TO STRING IF NEEDED)
            if (!user) {
              return done(new Error("User not found"), undefined);
            }
            const passportUser: PassportUser = {
              _id:
                typeof user._id === "string" ? user._id : user._id.toString(),
              email: user.email || email,
              name: user.name || displayName,
              provider: user.provider,
              providerId: user.providerId,
              providerEmail: user.providerEmail,
              githubUsername: user.githubUsername,
              githubConnectedAt: user.githubConnectedAt,
              githubScopes: user.githubScopes,
            };
            // RETURNING PASSPORT USER
            return done(null, passportUser);
          }
          // IF EMAIL WAS PREVIOUSLY USED (VIA PROVIDER EMAIL) TO PREVENT DUPLICATES, RETURN ERROR
          const existingUserWithProviderEmail = await User.findOne({
            providerEmail: email,
          })
            .lean()
            .exec();
          // IF EXISTING USER WITH PROVIDER EMAIL EXISTS, RETURN ERROR
          if (existingUserWithProviderEmail) {
            // RETURNING ERROR RESPONSE
            return done(
              new Error(
                `This email address was previously associated with another account. Please use your original OAuth account to log in.`
              ),
              undefined
            );
          }
          // CREATE NEW USER WITH GITHUB INTEGRATION DATA
          const newUser = await User.create({
            name: displayName,
            email: email,
            provider: "github",
            providerId: profile.id.toString(),
            providerEmail: email,
            profilePic: profile.photos?.[0]?.value || "",
            // GITHUB INTEGRATION FIELDS
            githubAccessToken: encryptedAccessToken,
            githubUsername: profile.username,
            githubConnectedAt: new Date(),
            githubScopes: githubScopes,
          });
          // CREATE PERSONAL WORKSPACE FOR THE NEW USER
          const personalWorkspace = await Workspace.create({
            name: `${displayName}'s Space`,
            description:
              "Your personal workspace for individual tasks and projects",
            visibility: "system",
            type: "personal",
            ownerId: newUser._id,
          });
          // UPDATE USER WITH PERSONAL WORKSPACE ID
          await User.findByIdAndUpdate(newUser._id, {
            personalWorkspaceId: personalWorkspace._id,
          });
          // RETURN NEW USER (CONVERT TO PLAIN OBJECT AND ENSURE _ID IS STRING)
          const userObject = newUser.toObject();
          // RETURNING PASSPORT USER
          const passportUser: PassportUser = {
            ...userObject,
            _id:
              typeof userObject._id === "string"
                ? userObject._id
                : userObject._id.toString(),
          };
          return done(null, passportUser);
        } catch (error) {
          // RETURNING ERROR RESPONSE
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
      _id: typeof user._id === "string" ? user._id : user._id.toString(),
      email: user.email,
      name: user.name,
      provider: user.provider,
      providerId: user.providerId,
      providerEmail: user.providerEmail,
      githubUsername: user.githubUsername,
      githubConnectedAt: user.githubConnectedAt,
      githubScopes: user.githubScopes,
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
