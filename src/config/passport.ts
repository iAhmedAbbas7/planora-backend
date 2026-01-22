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
import { Request } from "express";
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
  // <== IS NEW USER FLAG ==>
  isNewUser?: boolean;
  // <== SELECTED PLAN (CAN BE STRING, NULL, OR UNDEFINED) ==>
  selectedPlan?: string | null | undefined;
  // <== BILLING CYCLE (CAN BE STRING, NULL, OR UNDEFINED) ==>
  billingCycle?: string | null | undefined;
  // <== ADDITIONAL FIELDS ==>
  [key: string]: unknown;
}

// <== OAUTH STATE TYPE ==>
interface OAuthState {
  // <== MODE FIELD ==>
  mode: "login" | "register";
  // <== PLAN FIELD ==>
  plan?: string | null;
  // <== BILLING CYCLE FIELD ==>
  billingCycle?: string | null;
  // <== LINK USER ID FIELD ==>
  linkUserId?: string;
}

// <== PARSE OAUTH STATE ==>
const parseOAuthState = (stateStr: string | undefined): OAuthState => {
  // DEFAULT STATE
  const defaultState: OAuthState = { mode: "register", plan: null, billingCycle: "monthly" };
  // IF NO STATE, RETURN DEFAULT
  if (!stateStr) return defaultState;
  // TRY TO PARSE STATE
  try {
    // PARSE STATE
    const parsed = JSON.parse(stateStr);
    // RETURN PARSED STATE
    return {
      mode: parsed.mode === "login" ? "login" : "register",
      plan: parsed.plan || null,
      billingCycle: parsed.billingCycle || "monthly",
      linkUserId: parsed.linkUserId || undefined,
    };
  } catch {
    // RETURN DEFAULT STATE
    return defaultState;
  }
};

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
        passReqToCallback: true,
      },
      async (
        req: Request,
        _accessToken: string,
        _refreshToken: string,
        profile: GoogleProfile,
        done: VerifyCallback
      ) => {
        try {
          // PARSE STATE FROM REQUEST
          const state = parseOAuthState(req.query.state as string);
          // DESTRUCTURE STATE
          const { mode, plan, billingCycle } = state;
          // IF PROFILE ID OR EMAIL IS MISSING, RETURN ERROR
          if (!profile.id || !profile.emails?.[0]?.value) {
            // RETURN ERROR
            return done(
              new Error("Missing required profile information from Google"),
              undefined
            );
          }
          // GET PROFILE EMAIL
          const profileEmail = profile.emails[0].value;
          // FIND USER BY PROVIDER ID
          let user = await User.findOne({
            provider: "google",
            providerId: profile.id,
          })
            .lean()
            .exec();
          // IF USER EXISTS
          if (user) {
            // SYNC PROVIDER EMAIL IF CHANGED
            if (profile.emails[0].value !== user.providerEmail) {
              // UPDATE USER PROVIDER EMAIL
              await User.updateOne(
                { _id: user._id },
                { providerEmail: profile.emails[0].value }
              ).exec();
            }
            // RETURN USER
            const passportUser: PassportUser = {
              _id: typeof user._id === "string" ? user._id : user._id.toString(),
              email: user.email,
              name: user.name,
              provider: user.provider,
              providerId: user.providerId,
              providerEmail: user.providerEmail,
              isNewUser: false,
              selectedPlan: plan,
              billingCycle: billingCycle,
            };
            return done(null, passportUser);
          }
          // IF USER DOESN'T EXIST, CHECK IF MODE IS LOGIN - IF SO, REJECT (USER MUST SIGNUP FIRST)
          if (mode === "login") {
            // RETURN ERROR
            return done(
              new Error(
                "No account found with this Google account. Please sign up first."
              ),
              undefined
            );
          }
          // MODE IS REGISTER - CHECK IF EMAIL IS ALREADY USED BY ANOTHER ACCOUNT
          const existingUserWithEmail = await User.findOne({
            email: profileEmail,
          })
            .lean()
            .exec();
          // IF EMAIL IS ALREADY USED BY ANOTHER ACCOUNT
          if (existingUserWithEmail) {
            // IF EMAIL EXISTS BUT WITH DIFFERENT PROVIDER
            if (existingUserWithEmail.provider === "github") {
              // RETURN ERROR
              return done(
                new Error(
                  "This email is already registered with GitHub. Please sign in with GitHub instead."
                ),
                undefined
              );
            } else if (existingUserWithEmail.provider === null || !existingUserWithEmail.provider) {
              // MANUAL ACCOUNT EXISTS - DON'T OVERWRITE, SUGGEST LINKING OR USING PASSWORD
              return done(
                new Error(
                  "An account with this email already exists. Please sign in with your password, or use a different Google account."
                ),
                undefined
              );
            } else {
              // RETURN ERROR
              return done(
                new Error(
                  `This email is already registered with ${existingUserWithEmail.provider}. Please use that method to sign in.`
                ),
                undefined
              );
            }
          }
          // IF EMAIL WAS USED AS PROVIDER EMAIL BEFORE
          const existingUserWithProviderEmail = await User.findOne({
            providerEmail: profileEmail,
          })
            .lean()
            .exec();
          // IF EMAIL WAS USED AS PROVIDER EMAIL BEFORE
          if (existingUserWithProviderEmail) {
            // RETURN ERROR
            return done(
              new Error(
                "This email was previously associated with another account. Please use your original sign-in method."
              ),
              undefined
            );
          }
          // CREATE NEW USER WITH GOOGLE INTEGRATION DATA
          const userName = profile.displayName || profile.name?.givenName || "User";
          // CREATE NEW USER
          const newUser = await User.create({
            name: userName,
            email: profileEmail,
            provider: "google",
            providerId: profile.id,
            providerEmail: profileEmail,
            profilePic: profile.photos?.[0]?.value || "",
            selectedPlan: plan || null,
          });
          // CREATE PERSONAL WORKSPACE
          const personalWorkspace = await Workspace.create({
            name: `${userName}'s Space`,
            description: "Your personal workspace for individual tasks and projects",
            visibility: "system",
            type: "personal",
            ownerId: newUser._id,
          });
          // UPDATE USER WITH PERSONAL WORKSPACE ID
          await User.findByIdAndUpdate(newUser._id, {
            personalWorkspaceId: personalWorkspace._id,
          });
          // CONVERT NEW USER TO OBJECT
          const userObject = newUser.toObject();
          // RETURN NEW USER
          const passportUser: PassportUser = {
            ...userObject,
            _id: typeof userObject._id === "string" ? userObject._id : userObject._id.toString(),
            isNewUser: true,
            selectedPlan: plan,
            billingCycle: billingCycle,
          };
          // RETURN PASSPORT USER
          return done(null, passportUser);
        } catch (error) {
          // RETURN ERROR
          const err = error instanceof Error ? error : new Error("Unknown error occurred");
          // RETURN ERROR
          return done(err, undefined);
        }
      }
    )
  );
} else {
  // LOG WARNING
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
        passReqToCallback: true,
      },
      async (
        req: Request,
        accessToken: string,
        _refreshToken: string,
        profile: GitHubProfile,
        done: VerifyCallback
      ) => {
        try {
          // PARSE STATE FROM REQUEST
          const state = parseOAuthState(req.query.state as string);
          // DESTRUCTURE STATE
          const { mode, plan, billingCycle, linkUserId } = state;
          // IF THIS IS A LINK REQUEST, SKIP NORMAL FLOW
          if (linkUserId) {
            // RETURN USER WITH LINK MODE
            return done(null, { _id: linkUserId, linkMode: true } as any);
          }
          // IF PROFILE ID OR USERNAME IS MISSING, RETURN ERROR
          if (!profile.id || !profile.username) {
            // RETURN ERROR
            return done(
              new Error("Missing required profile information from GitHub"),
              undefined
            );
          }
          // GET EMAIL FROM PROFILE OR USE GITHUB NOREPLY EMAIL
          const email = profile.emails?.[0]?.value || `${profile.username}@users.noreply.github.com`;
          // GET DISPLAY NAME
          const displayName = profile.displayName || profile.username || "User";
          // ENCRYPT THE GITHUB ACCESS TOKEN FOR SECURE STORAGE
          const encryptedAccessToken = encryptSecret(accessToken);
          // GITHUB SCOPES THAT WERE REQUESTED
          const githubScopes = ["user:email", "read:user", "repo"];
          // FIND USER BY PROVIDER ID
          let user = await User.findOne({
            provider: "github",
            providerId: profile.id.toString(),
          })
            .lean()
            .exec();
          // IF USER EXISTS
          if (user) {
            // UPDATE GITHUB ACCESS TOKEN
            const updateFields: Record<string, unknown> = {
              githubAccessToken: encryptedAccessToken,
              githubUsername: profile.username,
              githubScopes: githubScopes,
            };
            // IF EMAIL IS DIFFERENT FROM PROVIDER EMAIL, UPDATE PROVIDER EMAIL
            if (email !== user.providerEmail) {
              // UPDATE PROVIDER EMAIL
              updateFields.providerEmail = email;
            }
            // IF GITHUB CONNECTED AT IS NOT SET, SET IT TO CURRENT DATE
            if (!user.githubConnectedAt) {
              // SET GITHUB CONNECTED AT TO CURRENT DATE
              updateFields.githubConnectedAt = new Date();
            }
            // UPDATE USER
            await User.updateOne({ _id: user._id }, updateFields).exec();
            // RETURN USER
            const passportUser: PassportUser = {
              _id: typeof user._id === "string" ? user._id : user._id.toString(),
              email: user.email || email,
              name: user.name || displayName,
              provider: user.provider,
              providerId: user.providerId,
              providerEmail: user.providerEmail,
              githubUsername: profile.username,
              githubConnectedAt: user.githubConnectedAt || new Date(),
              githubScopes: githubScopes,
              isNewUser: false,
              selectedPlan: plan,
              billingCycle: billingCycle,
            };
            // RETURN PASSPORT USER
            return done(null, passportUser);
          }
          // IF USER DOESN'T EXIST, CHECK IF MODE IS LOGIN - IF SO, REJECT (USER MUST SIGNUP FIRST)
          if (mode === "login") {
            // RETURN ERROR
            return done(
              new Error(
                "No account found with this GitHub account. Please sign up first."
              ),
              undefined
            );
          }
          // MODE IS REGISTER - CHECK IF EMAIL IS ALREADY USED BY ANOTHER ACCOUNT
          const existingUserWithEmail = await User.findOne({
            email: email,
          })
            .lean()
            .exec();
          // IF EMAIL IS ALREADY USED BY ANOTHER ACCOUNT
          if (existingUserWithEmail) {
            // IF EMAIL EXISTS BUT WITH DIFFERENT PROVIDER
            if (existingUserWithEmail.provider === "google") {
              // RETURN ERROR
              return done(
                new Error(
                  "This email is already registered with Google. Please sign in with Google instead."
                ),
                undefined
              );
            } 
            // IF EMAIL EXISTS BUT WITH NO PROVIDER
            else if (existingUserWithEmail.provider === null || !existingUserWithEmail.provider) {
              // RETURN ERROR
              return done(
                new Error(
                  "An account with this email already exists. Please sign in with your password, or use a different GitHub account."
                ),
                undefined
              );
            } else {
              // RETURN ERROR
              return done(
                new Error(
                  `This email is already registered with ${existingUserWithEmail.provider}. Please use that method to sign in.`
                ),
                undefined
              );
            }
          }
          // IF EMAIL WAS USED AS PROVIDER EMAIL BEFORE
          const existingUserWithProviderEmail = await User.findOne({
            providerEmail: email,
          })
            .lean()
            .exec();
          // IF EMAIL WAS USED AS PROVIDER EMAIL BEFORE
          if (existingUserWithProviderEmail) {
            // RETURN ERROR
            return done(
              new Error(
                "This email was previously associated with another account. Please use your original sign-in method."
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
            githubAccessToken: encryptedAccessToken,
            githubUsername: profile.username,
            githubConnectedAt: new Date(),
            githubScopes: githubScopes,
            selectedPlan: plan || null,
          });
          // CREATE PERSONAL WORKSPACE
          const personalWorkspace = await Workspace.create({
            name: `${displayName}'s Space`,
            description: "Your personal workspace for individual tasks and projects",
            visibility: "system",
            type: "personal",
            ownerId: newUser._id,
          });
          // UPDATE USER WITH PERSONAL WORKSPACE ID
          await User.findByIdAndUpdate(newUser._id, {
            personalWorkspaceId: personalWorkspace._id,
          });
          // CONVERT NEW USER TO OBJECT
          const userObject = newUser.toObject();
          // RETURN PASSPORT USER
          const passportUser: PassportUser = {
            ...userObject,
            _id: typeof userObject._id === "string" ? userObject._id : userObject._id.toString(),
            isNewUser: true,
            selectedPlan: plan,
            billingCycle: billingCycle,
          };
          // RETURN PASSPORT USER
          return done(null, passportUser);
        } catch (error) {
          // RETURN ERROR
          const err = error instanceof Error ? error : new Error("Unknown error occurred");
          // RETURN ERROR
          return done(err, undefined);
        }
      }
    )
  );
} else {
  // LOG WARNING
  console.warn(
    "⚠️  GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable."
  );
}

// <== SERIALIZE USER ==>
passport.serializeUser((user: unknown, done) => {
  // CONVERT USER TO PASSPORT USER
  const passportUser = user as PassportUser;
  // GET USER ID
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
      // RETURN ERROR
      return done(new Error("User not found"), undefined);
    }
    // CONVERT USER TO PASSPORT USER
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
    const err = error instanceof Error ? error : new Error("Unknown error occurred");
    // RETURN ERROR
    done(err, undefined);
  }
});

export default passport;
