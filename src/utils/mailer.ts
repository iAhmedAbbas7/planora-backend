// <== IMPORTS ==>
import nodemailer, { Transporter } from "nodemailer";

// <== MAILER CONFIGURATION ==>
const transporter: Transporter = nodemailer.createTransport({
  // <== SMTP SERVER CONFIGURATION ==>
  service: "gmail",
  // <== SMTP AUTHENTICATION ==>
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// <== EMAIL SENDING WITH RETRY LOGIC ==>
/**
 * SENDS EMAIL WITH RETRY LOGIC
 * @param mailOptions - MAIL OPTIONS FOR NODEMAILER
 * @param maxRetries - MAXIMUM NUMBER OF RETRY ATTEMPTS (DEFAULT: 3)
 * @param delay - DELAY IN MILLISECONDS BEFORE EACH RETRY (DEFAULT: 1000MS)
 * @returns PROMISE WITH EMAIL RESULT
 */
const sendMailWithRetry = async (
  mailOptions: nodemailer.SendMailOptions,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<nodemailer.SentMessageInfo> => {
  try {
    // ATTEMPT TO SEND EMAIL
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    // ERROR HANDLING
    console.error(
      `Error Sending Mail, Retries Left: ${maxRetries}`,
      error instanceof Error ? error.message : error
    );
    // IF RETRIES ARE LEFT, RETRY SENDING EMAIL
    if (maxRetries > 0) {
      // SET TIMEOUT FUNCTION TO ADD DELAY IN EACH RETRY
      await new Promise((resolve) => setTimeout(resolve, delay));
      // RETURNING THE RETRY FUNCTION TO ATTEMPT SENDING MAIL AGAIN (EXPONENTIAL BACKOFF)
      return sendMailWithRetry(mailOptions, maxRetries - 1, delay * 2);
    }
    // AFTER RETRIES FINISHED, THROWING AN ERROR IF EMAIL NOT SENT
    throw error;
  }
};

// <== EMAIL TEMPLATE GENERATION ==>
/**
 * GENERATES PROFESSIONAL EMAIL TEMPLATE WITH PLANORA BRANDING
 * @param content - MAIN CONTENT HTML
 * @param title - EMAIL TITLE
 * @returns COMPLETE HTML EMAIL TEMPLATE
 */
const generateEmailTemplate = (content: string, title: string): string => {
  // FRONTEND URL FOR LINKS
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // PRIMARY COLOR (PURPLE/VIOLET)
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // PRIMARY COLOR DARK
  const primaryColorDark = "#5b21b6";
  // LOGO SOURCE: USE CDN URL FROM ENVIRONMENT VARIABLE
  const logoSrc = process.env.LOGO_CDN_URL || "";
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>${title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          background-color: #f5f5f5;
        }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .email-header {
          background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%);
          padding: 40px 20px;
          text-align: center;
        }
        .logo {
          max-width: 80px;
          width: 80px;
          height: auto;
          margin: 0 auto 20px auto;
          display: block;
        }
        .email-body {
          padding: 40px 30px;
        }
        .email-footer {
          background-color: #f9fafb;
          padding: 30px;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .code-container {
          background-color: ${primaryColorLight};
          border: 2px solid ${primaryColor};
          border-radius: 12px;
          padding: 20px;
          margin: 30px 0;
          text-align: center;
        }
        .verification-code {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 8px;
          color: ${primaryColor};
          font-family: 'Courier New', monospace;
        }
        .button {
          display: inline-block;
          padding: 14px 28px;
          background-color: ${primaryColor};
          color: #ffffff !important;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          margin: 20px 0;
          border: none;
        }
        .button:hover {
          background-color: ${primaryColorDark};
        }
        a.button {
          color: #ffffff !important;
          text-decoration: none !important;
        }
        .footer-text {
          color: #6b7280;
          font-size: 14px;
          margin-top: 20px;
        }
        .footer-link {
          color: ${primaryColor};
          text-decoration: none;
        }
        @media only screen and (max-width: 600px) {
          .email-body {
            padding: 30px 20px;
          }
          .verification-code {
            font-size: 24px;
            letter-spacing: 4px;
          }
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          ${
            logoSrc
              ? `<img src="${logoSrc}" alt="PlanOra Logo" class="logo" style="display: block; margin: 0 auto 20px auto; max-width: 80px; width: 80px; height: auto; border: 0; outline: none; text-decoration: none;" />`
              : `<div style="color: #ffffff; font-size: 24px; font-weight: bold; margin-bottom: 20px;">PlanOra</div>`
          }
          <h1 style="color: #ffffff; font-size: 24px; margin: 0;">${title}</h1>
        </div>
        <div class="email-body">
          ${content}
        </div>
        <div class="email-footer">
          <p class="footer-text">
            This email was sent by <strong>PlanOra</strong><br/>
            If you didn't request this, please ignore this email.
          </p>
          <p class="footer-text" style="margin-top: 10px;">
            <a href="${frontendUrl}" class="footer-link">Visit PlanOra</a> | 
            <a href="${frontendUrl}/settings" class="footer-link">Manage Account</a>
          </p>
          <p class="footer-text" style="margin-top: 15px; font-size: 12px;">
            © ${new Date().getFullYear()} PlanOra. All rights reserved.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// <== EMAIL FUNCTIONS ==>
/**
 * SENDS VERIFICATION EMAIL TO USER DURING SIGNUP
 * @param toEmail - Email Address of the User
 * @param code - 6-Digit Verification Code
 * @param userName - Name of the User
 * @returns Promise with Email Result
 */
export const sendVerificationEmail = async (
  toEmail: string,
  code: string,
  userName: string
): Promise<nodemailer.SentMessageInfo> => {
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px;">
      Welcome to PlanOra! We're excited to have you on board. To complete your registration, 
      please verify your email address by entering the verification code below.
    </p>
    <div class="code-container">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Your verification code:</p>
      <div class="verification-code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        This code will expire in 2 minutes
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you didn't create an account with PlanOra, please ignore this email.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Verify Your Email - PlanOra`,
    html: generateEmailTemplate(content, "Email Verification"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS EMAIL VERIFICATION CONFIRMATION
 * @param toEmail - Email Address of the User
 * @param userName - Name of the User
 * @returns Promise with Email Result
 */
export const sendEmailVerificationConfirmation = async (
  toEmail: string,
  userName: string
): Promise<nodemailer.SentMessageInfo> => {
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px;">
      🎉 Congratulations! Your email has been successfully verified.
    </p>
    <p style="color: #4b5563; margin-bottom: 20px;">
      Your PlanOra account is now active and ready to use. You can start organizing your projects 
      and tasks right away!
    </p>
    <p style="color: #4b5563; margin-top: 30px;">
      If you have any questions, feel free to reach out to our support team.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Email Verified Successfully - PlanOra`,
    html: generateEmailTemplate(content, "Email Verified"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS WELCOME EMAIL TO NEW USERS (OAUTH OR VERIFIED MANUAL SIGNUP)
 * @param toEmail - Email Address of the User
 * @param userName - Name of the User
 * @returns Promise with Email Result
 */
export const sendWelcomeEmail = async (
  toEmail: string,
  userName: string
): Promise<nodemailer.SentMessageInfo> => {
  // FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // PRIMARY COLOR DARK
  const primaryColorDark = "#5b21b6";
  // DASHBOARD IMAGE URL FROM ENVIRONMENT VARIABLES
  const dashboardImageUrl =
    process.env.EMAIL_DASHBOARD_IMAGE_URL ||
    `${
      process.env.BACKEND_URL || process.env.API_URL || "http://localhost:7000"
    }/assets/DASHBOARD.png`;
  // WELCOME EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 28px;">Welcome to PlanOra, ${userName}! 🎉</h2>
    <p style="color: #4b5563; margin-bottom: 30px; font-size: 16px; line-height: 1.6;">
      We're thrilled to have you on board! PlanOra is your all-in-one solution for managing projects, 
      tracking tasks, and staying productive. Your account is now active and ready to use!
    </p>
    <!-- DASHBOARD IMAGE SECTION -->
    <div style="margin: 40px 0; background-color: #f9fafb; border-radius: 12px; padding: 30px; border: 1px solid #e5e7eb;">
      <h3 style="color: ${primaryColor}; font-size: 22px; margin-bottom: 15px; font-weight: 600; text-align: center;">
        📊 Your All-in-One Dashboard
      </h3>
      <p style="color: #4b5563; margin-bottom: 25px; font-size: 15px; line-height: 1.6; text-align: center;">
        Your dashboard is the command center of PlanOra. Here's a preview of what you'll see:
      </p>
      ${
        dashboardImageUrl
          ? `
      <div style="text-align: center; margin: 25px 0;">
        <img 
          src="${dashboardImageUrl}" 
          alt="PlanOra Dashboard" 
          style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;"
        />
      </div>
      `
          : ""
      }
    </div>
    <!-- INTERACTIVE FEATURES SECTION -->
    <div style="margin: 40px 0;">
      <h3 style="color: ${primaryColor}; font-size: 24px; margin-bottom: 30px; font-weight: 600; text-align: center;">
        🌟 Explore PlanOra's Powerful Features
      </h3>
      <!-- PROJECTS FEATURE -->
      <div style="margin: 30px 0; background-color: ${primaryColorLight}; border-radius: 12px; padding: 25px; border-left: 4px solid ${primaryColor};">
        <h4 style="color: ${primaryColor}; font-size: 20px; margin-bottom: 12px; font-weight: 600;">
          🎯 Smart Project Management
        </h4>
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 15px; line-height: 1.6;">
          Organize your work into projects and break them down into manageable tasks. Navigate to the <strong>Projects</strong> page to:
        </p>
        <ul style="color: #4b5563; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Create and manage multiple projects with ease</li>
          <li>Set priorities (high, medium, low) to focus on what matters most</li>
          <li>Track progress with visual progress bars</li>
          <li>View project analytics and performance insights</li>
          <li>Group related tasks together for better organization</li>
        </ul>
      </div>
      <!-- TASKS FEATURE -->
      <div style="margin: 30px 0; background-color: #ffffff; border-radius: 12px; padding: 25px; border-left: 4px solid ${primaryColor}; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <h4 style="color: ${primaryColor}; font-size: 20px; margin-bottom: 12px; font-weight: 600;">
          ✅ Intuitive Task Management
        </h4>
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 15px; line-height: 1.6;">
          Manage your daily to-dos effortlessly. On the <strong>Tasks</strong> page, you can:
        </p>
        <ul style="color: #4b5563; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Create tasks quickly with our streamlined interface</li>
          <li>Track task status (pending, in progress, completed)</li>
          <li>Set due dates and get smart reminders</li>
          <li>Filter tasks by status, priority, or project</li>
          <li>Recover deleted tasks from the trash or permanently remove them</li>
        </ul>
      </div>
      <!-- ANALYTICS FEATURE -->
      <div style="margin: 30px 0; background-color: ${primaryColorLight}; border-radius: 12px; padding: 25px; border-left: 4px solid ${primaryColor};">
        <h4 style="color: ${primaryColor}; font-size: 20px; margin-bottom: 12px; font-weight: 600;">
          📈 Progress Insights & Analytics
        </h4>
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 15px; line-height: 1.6;">
          Visualize your productivity and track your achievements. Your dashboard includes:
        </p>
        <ul style="color: #4b5563; margin: 0; padding-left: 20px; line-height: 1.8;">
          <li>Interactive charts showing your productivity trends</li>
          <li>Task completion rates and project progress metrics</li>
          <li>Weekly projects chart to track your workload</li>
          <li>Tasks created today and recent activity overview</li>
          <li>Progress trends to identify areas for improvement</li>
        </ul>
      </div>
      <!-- ADDITIONAL FEATURES GRID -->
      <div style="margin: 30px 0;">
        <h4 style="color: ${primaryColor}; font-size: 20px; margin-bottom: 20px; font-weight: 600; text-align: center;">
          🎨 More Features to Explore
        </h4>
        <div style="display: grid; grid-template-columns: 1fr; gap: 15px;">
          <!-- Feature 1 -->
          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
            <h5 style="color: ${primaryColor}; font-size: 17px; margin-bottom: 8px; font-weight: 600;">
              🎨 Customizable Workspace
            </h5>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">
              Switch between light or dark themes and personalize your setup with custom accent colors in <strong>Settings</strong>. Make PlanOra match your style!
            </p>
          </div>
          <!-- Feature 2 -->
          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
            <h5 style="color: ${primaryColor}; font-size: 17px; margin-bottom: 8px; font-weight: 600;">
              🔔 Smart Notifications
            </h5>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">
              Stay on top of your day with smart reminders and notifications. Never miss an important deadline or task update!
            </p>
          </div>
          <!-- Feature 3 -->
          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 15px;">
            <h5 style="color: ${primaryColor}; font-size: 17px; margin-bottom: 8px; font-weight: 600;">
              📝 Quick Notes
            </h5>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0;">
              Jot down quick thoughts, ideas, or reminders with our built-in notepad feature on your dashboard. Keep everything organized in one place.
            </p>
          </div>
        </div>
      </div>
    </div>
    <!-- GET STARTED CTA -->
    <div style="text-align: center; margin: 40px 0; padding: 30px; background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColorDark} 100%); border-radius: 12px;">
      <h3 style="color: #ffffff; font-size: 24px; margin-bottom: 15px; font-weight: 600;">
        Ready to Get Started?
      </h3>
      <p style="color: #ffffff; margin-bottom: 25px; font-size: 16px; opacity: 0.95;">
        Your PlanOra account is ready! Start organizing your projects and tasks right away.
      </p>
      <a 
        href="${frontendUrl}/dashboard" 
        class="button" 
        style="color: #ffffff !important; text-decoration: none !important; display: inline-block; padding: 14px 32px; background-color: #ffffff; color: ${primaryColor} !important; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"
      >
        Go to Dashboard
      </a>
    </div>
    <!-- QUICK TIPS -->
    <div style="margin: 40px 0; background-color: ${primaryColorLight}; border-radius: 12px; padding: 25px; border-left: 4px solid ${primaryColor};">
      <h3 style="color: ${primaryColor}; font-size: 20px; margin-bottom: 15px; font-weight: 600;">
        💡 Quick Tips to Get Started
      </h3>
      <ol style="color: #4b5563; margin: 0; padding-left: 20px; line-height: 1.8;">
        <li style="margin-bottom: 10px;">Create your first project and add a few tasks to get familiar with the interface</li>
        <li style="margin-bottom: 10px;">Set priorities for your tasks to focus on what's most important</li>
        <li style="margin-bottom: 10px;">Use the dashboard to get a quick overview of all your work</li>
        <li style="margin-bottom: 10px;">Customize your theme and accent color in Settings to match your style</li>
        <li style="margin-bottom: 10px;">Explore the analytics section to track your productivity trends</li>
      </ol>
    </div>

    <p style="color: #4b5563; margin-top: 30px; font-size: 15px; line-height: 1.6;">
      If you have any questions or need help getting started, feel free to reach out to our support team. 
      We're here to help you succeed!
    </p>
    <p style="color: #4b5563; margin-top: 20px; font-size: 15px;">
      Best regards,<br/>
      <strong style="color: ${primaryColor};">The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Welcome to PlanOra - Let's Get Started! 🎉`,
    html: generateEmailTemplate(content, "Welcome to PlanOra"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS PASSWORD RESET CODE EMAIL
 * @param toEmail - Email Address of the User
 * @param code - 6-Digit Reset Code
 * @param userName - Name of the User
 * @returns Promise with Email Result
 */
export const sendPasswordResetEmail = async (
  toEmail: string,
  code: string,
  userName: string
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      We received a request to reset your password for your PlanOra account. Use the verification code below to reset your password.
    </p>
    <div class="code-container">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Your password reset code:</p>
      <div class="verification-code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        This code will expire in 2 minutes
      </p>
    </div>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Security Tip:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you have any questions or need assistance, feel free to reach out to our support team.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Password Reset Request - PlanOra`,
    html: generateEmailTemplate(content, "Password Reset"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS PASSWORD CHANGE CONFIRMATION EMAIL
 * @param toEmail - Email Address of the User
 * @param userName - Name of the User
 * @param changedAt - Timestamp when password was changed
 * @returns Promise with Email Result
 */
/**
 * SENDS PASSWORD CHANGE VERIFICATION CODE
 * @param toEmail - Email Address of the User
 * @param code - 6-Digit Verification Code
 * @param userName - Name of the User
 * @returns Promise with Email Result
 */
export const sendPasswordChangeVerificationCode = async (
  toEmail: string,
  code: string,
  userName: string
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px;">
      You recently requested to change your PlanOra account password.
      To verify this change, please use the following code:
    </p>
    <div class="code-container">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Your verification code:</p>
      <div class="verification-code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        This code will expire in 10 minutes
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you did not request this password change, please ignore this email or contact support immediately.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Verify Your Password Change - PlanOra`,
    html: generateEmailTemplate(content, "Password Change Verification"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

export const sendPasswordChangeConfirmation = async (
  toEmail: string,
  userName: string,
  changedAt: Date
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // FORMAT DATE
  const formattedDate = changedAt.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      🎉 Your password has been successfully changed!
    </p>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Password changed at:</strong><br/>
        ${formattedDate}
      </p>
    </div>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 15px; line-height: 1.6;">
      If you didn't make this change, please contact our support team immediately to secure your account.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/login" class="button" style="color: #ffffff !important; text-decoration: none !important; display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; border-radius: 8px; font-weight: 600;">
        Login to Your Account
      </a>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you have any questions or concerns, feel free to reach out to our support team.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Password Changed Successfully - PlanOra`,
    html: generateEmailTemplate(content, "Password Changed"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS EMAIL CHANGE VERIFICATION CODE TO CURRENT EMAIL
 * @param toEmail - Current Email Address of the User
 * @param code - 6-Digit Verification Code
 * @param userName - Name of the User
 * @param newEmail - New Email Address User Wants to Change To
 * @returns Promise with Email Result
 */
export const sendEmailChangeVerificationCodeCurrent = async (
  toEmail: string,
  code: string,
  userName: string,
  newEmail: string
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      We received a request to change your email address from <strong>${toEmail}</strong> to <strong>${newEmail}</strong>.
    </p>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      To verify that you own this email address, please enter the verification code below:
    </p>
    <div class="code-container">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Your verification code:</p>
      <div class="verification-code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        This code will expire in 10 minutes
      </p>
    </div>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Security Notice:</strong> If you didn't request this email change, please ignore this email and contact our support team immediately to secure your account.
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      After verifying this code, you'll receive another verification code at your new email address to complete the change.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Verify Your Current Email - PlanOra`,
    html: generateEmailTemplate(content, "Email Change Verification"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS EMAIL CHANGE VERIFICATION CODE TO NEW EMAIL
 * @param toEmail - New Email Address of the User
 * @param code - 6-Digit Verification Code
 * @param userName - Name of the User
 * @param currentEmail - Current Email Address
 * @returns Promise with Email Result
 */
export const sendEmailChangeVerificationCodeNew = async (
  toEmail: string,
  code: string,
  userName: string,
  currentEmail: string
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      You're one step away from changing your PlanOra account email from <strong>${currentEmail}</strong> to <strong>${toEmail}</strong>.
    </p>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      To complete the email change, please enter the verification code below:
    </p>
    <div class="code-container">
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 10px;">Your verification code:</p>
      <div class="verification-code">${code}</div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 10px;">
        This code will expire in 10 minutes
      </p>
    </div>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Important:</strong> If you didn't request this email change, please ignore this email. The change will not be completed without this verification code.
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      Once verified, your email address will be updated and you'll receive a confirmation email at this address.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Verify Your New Email - PlanOra`,
    html: generateEmailTemplate(content, "New Email Verification"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS EMAIL CHANGE CONFIRMATION TO NEW EMAIL
 * @param toEmail - New Email Address of the User
 * @param userName - Name of the User
 * @param changedAt - Timestamp when email was changed
 * @returns Promise with Email Result
 */
export const sendEmailChangeConfirmation = async (
  toEmail: string,
  userName: string,
  changedAt: Date
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // FORMAT DATE
  const formattedDate = changedAt.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      🎉 Your email address has been successfully changed!
    </p>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Your new email address:</strong><br/>
        ${toEmail}
      </p>
      <p style="color: #4b5563; font-size: 14px; margin: 10px 0 0 0; line-height: 1.6;">
        <strong>Changed at:</strong><br/>
        ${formattedDate}
      </p>
    </div>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 15px; line-height: 1.6;">
      From now on, you'll receive all PlanOra notifications and communications at this email address. You can use this email to log in to your account.
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/dashboard" class="button" style="color: #ffffff !important; text-decoration: none !important; display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; border-radius: 8px; font-weight: 600;">
        Go to Dashboard
      </a>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you didn't make this change, please contact our support team immediately to secure your account.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Email Changed Successfully - PlanOra`,
    html: generateEmailTemplate(content, "Email Changed"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};

/**
 * SENDS EMAIL CHANGE NOTIFICATION TO OLD EMAIL
 * @param toEmail - Old Email Address of the User
 * @param userName - Name of the User
 * @param newEmail - New Email Address
 * @param changedAt - Timestamp when email was changed
 * @returns Promise with Email Result
 */
export const sendEmailChangeNotification = async (
  toEmail: string,
  userName: string,
  newEmail: string,
  changedAt: Date
): Promise<nodemailer.SentMessageInfo> => {
  // PRIMARY COLOR
  const primaryColor = "#7c3aed";
  // PRIMARY COLOR LIGHT
  const primaryColorLight = "#ede9fe";
  // FRONTEND URL
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // FORMAT DATE
  const formattedDate = changedAt.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  // EMAIL CONTENT
  const content = `
    <h2 style="color: #1f2937; margin-bottom: 20px;">Hello ${userName}!</h2>
    <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; line-height: 1.6;">
      This is to notify you that your PlanOra account email address has been changed.
    </p>
    <div style="background-color: ${primaryColorLight}; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #4b5563; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>Previous email:</strong><br/>
        ${toEmail}
      </p>
      <p style="color: #4b5563; font-size: 14px; margin: 10px 0 0 0; line-height: 1.6;">
        <strong>New email:</strong><br/>
        ${newEmail}
      </p>
      <p style="color: #4b5563; font-size: 14px; margin: 10px 0 0 0; line-height: 1.6;">
        <strong>Changed at:</strong><br/>
        ${formattedDate}
      </p>
    </div>
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 25px 0; border-radius: 4px;">
      <p style="color: #991b1b; font-size: 14px; margin: 0; line-height: 1.6;">
        <strong>⚠️ Security Alert:</strong> If you didn't make this change, please contact our support team immediately to secure your account. This email address will no longer be associated with your PlanOra account.
      </p>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      From now on, all PlanOra notifications and communications will be sent to your new email address (<strong>${newEmail}</strong>).
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${frontendUrl}/login" class="button" style="color: #ffffff !important; text-decoration: none !important; display: inline-block; padding: 14px 28px; background-color: ${primaryColor}; border-radius: 8px; font-weight: 600;">
        Login to Your Account
      </a>
    </div>
    <p style="color: #4b5563; margin-top: 30px;">
      If you have any questions or concerns, feel free to reach out to our support team.
    </p>
    <p style="color: #4b5563; margin-top: 20px;">
      Best regards,<br/>
      <strong>The PlanOra Team</strong>
    </p>
  `;
  // MAIL OPTIONS
  const mailOptions: nodemailer.SendMailOptions = {
    from: `PlanOra <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Email Address Changed - PlanOra`,
    html: generateEmailTemplate(content, "Email Change Notification"),
  };
  // SEND EMAIL WITH RETRY
  return sendMailWithRetry(mailOptions);
};
