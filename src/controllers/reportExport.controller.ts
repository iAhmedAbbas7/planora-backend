// <== IMPORTS ==>
import type {
  TFontDictionary,
  StyleDictionary,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import PdfPrinter from "pdfmake";
import { v4 as uuidv4 } from "uuid";
import { Task } from "../models/task.model.js";
import { User } from "../models/user.model.js";
import { Project } from "../models/project.model.js";
import expressAsyncHandler from "express-async-handler";
import { Workspace } from "../models/workspace.model.js";
import { FocusSession } from "../models/focusSession.model.js";
import { SharedReport } from "../models/sharedReport.model.js";
import { WorkspaceMember } from "../models/workspaceMember.model.js";

// <== PDF CONTENT TYPE ==>
type PdfContent = Record<string, unknown>;

// <== PDF DOCUMENT DEFINITION TYPE ==>
interface PdfDocDefinition {
  // <== PAGE SIZE ==>
  pageSize?: string;
  // <== PAGE MARGINS ==>
  pageMargins?: number[];
  // <== HEADER ==>
  header?:
    | PdfContent
    | ((currentPage: number, pageCount: number) => PdfContent);
  // <== FOOTER ==>
  footer?:
    | PdfContent
    | ((currentPage: number, pageCount: number) => PdfContent);
  // <== CONTENT ==>
  content: PdfContent[];
  // <== STYLES ==>
  styles?: StyleDictionary;
  // <== DEFAULT STYLE ==>
  defaultStyle?: Record<string, unknown>;
}

// <== HELPER TO CAST DOC DEFINITION ==>
const toPdfmakeDoc = (doc: PdfDocDefinition): TDocumentDefinitions =>
  doc as unknown as TDocumentDefinitions;

// <== AUTHENTICATED REQUEST TYPE ==>
interface AuthenticatedRequest {
  // <== USER ID ==>
  id: string;
}

// <== REPORT PERIOD TYPE ==>
type ReportPeriod = "week" | "month" | "quarter" | "year";

// <== REPORT TYPE ==>
type ReportType = "personal" | "project" | "workspace";

// <== PLANORA BRAND COLORS ==>
const BRAND_COLORS = {
  // PRIMARY PURPLE
  primary: "7C3AED",
  // PRIMARY LIGHT
  primaryLight: "A78BFA",
  // PRIMARY LIGHTER
  primaryLighter: "DDD6FE",
  // PRIMARY EXTRA LIGHT
  primaryExtraLight: "F5F3FF",
  // PRIMARY DARK
  primaryDark: "5B21B6",
  // PRIMARY DARKER
  primaryDarker: "4C1D95",
  // SUCCESS GREEN
  success: "22C55E",
  // SUCCESS LIGHT
  successLight: "DCFCE7",
  // WARNING AMBER
  warning: "F59E0B",
  // WARNING LIGHT
  warningLight: "FEF3C7",
  // DANGER RED
  danger: "EF4444",
  // DANGER LIGHT
  dangerLight: "FEE2E2",
  // INFO BLUE
  info: "3B82F6",
  // INFO LIGHT
  infoLight: "DBEAFE",
  // DARK BACKGROUND
  darkBg: "1E1B4B",
  // LIGHT GRAY
  lightGray: "F8FAFC",
  // MEDIUM GRAY
  mediumGray: "E2E8F0",
  // DARK TEXT
  darkText: "1E293B",
  // LIGHT TEXT
  lightText: "64748B",
  // EXTRA LIGHT TEXT
  extraLightText: "94A3B8",
  // WHITE
  white: "FFFFFF",
  // GRADIENT START
  gradientStart: "8B5CF6",
  // GRADIENT END
  gradientEnd: "6366F1",
};

// <== PDF FONTS CONFIGURATION ==>
const pdfFonts: TFontDictionary = {
  Roboto: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

// <== PDF PRINTER INSTANCE ==>
const pdfPrinter = new PdfPrinter(pdfFonts);

// <== PDF STYLES ==>
const pdfStyles: StyleDictionary = {
  // MAIN TITLE
  title: {
    fontSize: 28,
    bold: true,
    color: "#" + BRAND_COLORS.darkBg,
    margin: [0, 0, 0, 4],
  },
  // SUBTITLE
  subtitle: {
    fontSize: 11,
    color: "#" + BRAND_COLORS.lightText,
    margin: [0, 0, 0, 16],
  },
  // SECTION HEADER
  sectionHeader: {
    fontSize: 13,
    bold: true,
    color: "#" + BRAND_COLORS.primary,
    margin: [0, 24, 0, 12],
  },
  // SUBSECTION HEADER
  subsectionHeader: {
    fontSize: 11,
    bold: true,
    color: "#" + BRAND_COLORS.darkText,
    margin: [0, 12, 0, 8],
  },
  // STAT LABEL
  statLabel: {
    fontSize: 9,
    color: "#" + BRAND_COLORS.lightText,
  },
  // STAT VALUE
  statValue: {
    fontSize: 20,
    bold: true,
    color: "#" + BRAND_COLORS.darkText,
  },
  // TABLE HEADER
  tableHeader: {
    fontSize: 9,
    bold: true,
    color: "#FFFFFF",
    fillColor: "#" + BRAND_COLORS.primary,
    margin: [8, 10, 8, 10],
  },
  // TABLE CELL
  tableCell: {
    fontSize: 9,
    color: "#" + BRAND_COLORS.darkText,
    margin: [8, 8, 8, 8],
  },
  // FOOTER TEXT
  footerText: {
    fontSize: 8,
    color: "#" + BRAND_COLORS.lightText,
    alignment: "center",
  },
  // SMALL TEXT
  smallText: {
    fontSize: 8,
    color: "#" + BRAND_COLORS.extraLightText,
  },
  // BADGE
  badge: {
    fontSize: 8,
    bold: true,
    color: "#" + BRAND_COLORS.white,
  },
};

// <== CREATE PDF STAT CARD ==>
const createPdfStatCard = (
  label: string,
  value: string | number,
  color: string = BRAND_COLORS.primary,
  bgColor: string = BRAND_COLORS.primaryExtraLight
): PdfContent => {
  // RETURN STAT CARD
  return {
    stack: [
      {
        canvas: [
          {
            type: "rect",
            x: 0,
            y: 0,
            w: 120,
            h: 70,
            r: 8,
            color: "#" + bgColor,
          },
        ],
      },
      {
        text: String(value),
        fontSize: 24,
        bold: true,
        color: "#" + color,
        alignment: "center",
        relativePosition: { x: 0, y: -55 },
      },
      {
        text: label,
        fontSize: 9,
        color: "#" + BRAND_COLORS.lightText,
        alignment: "center",
        relativePosition: { x: 0, y: -28 },
      },
    ],
    width: 120,
  };
};

// <== CREATE PDF PROGRESS BAR ==>
const createPdfProgressBar = (
  percentage: number,
  label: string,
  color: string = BRAND_COLORS.primary
): PdfContent => {
  // MAX WIDTH
  const maxWidth = 515;
  // FILLED WIDTH
  const filledWidth = Math.round((percentage / 100) * maxWidth);
  // RETURN PROGRESS BAR
  return {
    // STACK
    stack: [
      {
        // COLUMNS
        columns: [
          // LABEL
          {
            text: label,
            fontSize: 11,
            bold: true,
            color: "#" + BRAND_COLORS.darkText,
          },
          // PERCENTAGE
          {
            text: `${percentage}%`,
            fontSize: 11,
            bold: true,
            color: "#" + color,
            alignment: "right",
          },
        ],
        margin: [0, 0, 0, 8],
      },
      // BACKGROUND BAR
      {
        // CANVAS
        canvas: [
          // BACKGROUND BAR
          {
            type: "rect",
            x: 0,
            y: 0,
            w: maxWidth,
            h: 10,
            r: 5,
            color: "#" + BRAND_COLORS.mediumGray,
          },
        ],
      },
      // FILLED BAR
      {
        // CANVAS
        canvas: [
          // FILLED BAR
          {
            type: "rect",
            x: 0,
            y: 0,
            w: Math.max(filledWidth, 10),
            h: 10,
            r: 5,
            color: "#" + color,
          },
        ],
        // RELATIVE POSITION
        relativePosition: { x: 0, y: -10 },
      },
    ],
    // MARGIN
    margin: [0, 16, 0, 16],
  };
};

// <== CREATE PDF DISTRIBUTION CHART ==>
const createPdfDistributionChart = (
  title: string,
  data: Array<{ label: string; value: number; color: string }>
): PdfContent => {
  // TOTAL
  const total = data.reduce((sum, item) => sum + item.value, 0);
  // IF NO DATA
  if (total === 0) {
    // RETURN NO DATA MESSAGE
    return {
      // STACK
      stack: [
        // TITLE
        { text: title, style: "sectionHeader" },
        // STACK
        {
          stack: [
            // CANVAS
            {
              // BACKGROUND
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: 515,
                  h: 60,
                  r: 8,
                  color: "#" + BRAND_COLORS.lightGray,
                },
              ],
            },
            // TEXT
            {
              text: "No data available",
              fontSize: 11,
              color: "#" + BRAND_COLORS.lightText,
              italics: true,
              alignment: "center",
              relativePosition: { x: 0, y: -38 },
            },
          ],
        },
      ],
    };
  }
  // MAX BAR WIDTH
  const maxBarWidth = 280;
  // CHART ROWS
  const chartRows = data.map((item) => {
    // PERCENTAGE
    const percentage = Math.round((item.value / total) * 100);
    // BAR WIDTH
    const barWidth = Math.max((percentage / 100) * maxBarWidth, 8);
    // RETURN CHART ROW
    return {
      // COLUMNS
      columns: [
        // LABEL
        {
          text: item.label,
          fontSize: 10,
          bold: true,
          color: "#" + BRAND_COLORS.darkText,
          width: 100,
          margin: [0, 6, 0, 6],
        },
        // BAR CONTAINER
        {
          stack: [
            // BACKGROUND
            {
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: maxBarWidth,
                  h: 16,
                  r: 4,
                  color: "#" + BRAND_COLORS.lightGray,
                },
              ],
            },
            // FILLED BAR
            {
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: barWidth,
                  h: 16,
                  r: 4,
                  color: "#" + item.color,
                },
              ],
              relativePosition: { x: 0, y: -16 },
            },
          ],
          width: maxBarWidth,
          margin: [8, 4, 8, 4],
        },
        // VALUE
        {
          text: `${item.value}`,
          fontSize: 11,
          bold: true,
          color: "#" + item.color,
          width: 50,
          alignment: "right",
          margin: [0, 6, 0, 6],
        },
        // PERCENTAGE
        {
          text: `${percentage}%`,
          fontSize: 10,
          color: "#" + BRAND_COLORS.lightText,
          width: 45,
          alignment: "right",
          margin: [0, 6, 0, 6],
        },
      ],
      margin: [0, 2, 0, 2],
    };
  });
  // RETURN DISTRIBUTION CHART
  return {
    // STACK
    stack: [
      // TITLE
      { text: title, style: "sectionHeader" },
      // CHART CONTAINER WITH BACKGROUND
      {
        // STACK
        stack: [
          {
            // CANVAS
            canvas: [
              // BACKGROUND
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 515,
                h: data.length * 32 + 24,
                r: 8,
                color: "#" + BRAND_COLORS.white,
              },
              // BORDER
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 515,
                h: data.length * 32 + 24,
                r: 8,
                lineWidth: 1,
                lineColor: "#" + BRAND_COLORS.mediumGray,
              },
            ],
          },
          {
            // STACK
            stack: chartRows,
            relativePosition: { x: 12, y: -(data.length * 32 + 12) },
          },
        ],
      },
    ],
  };
};

// <== GET DATE RANGE HELPER ==>
const getDateRange = (
  period: ReportPeriod
): { startDate: Date; endDate: Date } => {
  // GET END DATE (NOW)
  const endDate = new Date();
  // GET START DATE BASED ON PERIOD
  const startDate = new Date();
  // SET START DATE BASED ON PERIOD
  switch (period) {
    // WEEK
    case "week":
      // SET START DATE TO 7 DAYS AGO
      startDate.setDate(startDate.getDate() - 7);
      break;
    // MONTH
    case "month":
      // SET START DATE TO 1 MONTH AGO
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    // QUARTER
    case "quarter":
      // SET START DATE TO 3 MONTHS AGO
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    // YEAR
    case "year":
      // SET START DATE TO 1 YEAR AGO
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      // DEFAULT TO 1 MONTH AGO
      startDate.setMonth(startDate.getMonth() - 1);
  }
  // RETURN DATE RANGE
  return { startDate, endDate };
};

// <== GET DAY NAME HELPER ==>
const getDayName = (dayOfWeek: number): string => {
  // DAY NAMES ARRAY
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  // RETURN DAY NAME
  return days[dayOfWeek] || "Unknown";
};

// <== FORMAT DURATION HELPER ==>
const formatDuration = (minutes: number): string => {
  // IF LESS THAN 60 MINUTES
  if (minutes < 60) {
    // RETURN FORMATTED DURATION
    return `${minutes} minutes`;
  }
  // CALCULATE HOURS
  const hours = Math.floor(minutes / 60);
  // REMAINING MINUTES
  const remainingMinutes = minutes % 60;
  // IF NO REMAINING MINUTES
  if (remainingMinutes === 0) {
    // RETURN FORMATTED DURATION
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  // RETURN FORMATTED DURATION WITH HOURS AND MINUTES
  return `${hours}h ${remainingMinutes}m`;
};

// <== GET PERIOD LABEL HELPER ==>
const getPeriodLabel = (period: ReportPeriod): string => {
  // SWITCH ON PERIOD
  switch (period) {
    // WEEK
    case "week":
      return "Last 7 Days";
    // MONTH
    case "month":
      return "Last Month";
    // QUARTER
    case "quarter":
      return "Last Quarter";
    // YEAR
    case "year":
      return "Last Year";
    default:
      // DEFAULT TO CUSTOM PERIOD
      return "Custom Period";
  }
};

// <== FORMAT HOUR HELPER ==>
const formatHour = (hour: number): string => {
  // IF HOUR IS 0
  if (hour === 0) {
    // RETURN 12:00 AM
    return "12:00 AM";
  }
  // IF HOUR IS 12
  if (hour === 12) {
    // RETURN 12:00 PM
    return "12:00 PM";
  }
  // IF HOUR IS LESS THAN 12
  if (hour < 12) {
    // RETURN FORMATTED HOUR
    return `${hour}:00 AM`;
  }
  // OTHERWISE
  return `${hour - 12}:00 PM`;
};

// <== APPLY HEADER STYLE HELPER ==>
const applyHeaderStyle = (
  row: ExcelJS.Row,
  bgColor: string = BRAND_COLORS.primary
) => {
  // ITERATE THROUGH CELLS
  row.eachCell((cell) => {
    // SET FONT
    cell.font = {
      bold: true,
      color: { argb: BRAND_COLORS.white },
      size: 11,
    };
    // SET FILL
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgColor },
    };
    // SET ALIGNMENT
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    // SET BORDER
    cell.border = {
      top: { style: "thin", color: { argb: bgColor } },
      bottom: { style: "thin", color: { argb: bgColor } },
      left: { style: "thin", color: { argb: bgColor } },
      right: { style: "thin", color: { argb: bgColor } },
    };
  });
  // SET ROW HEIGHT
  row.height = 28;
};

// <== APPLY DATA ROW STYLE HELPER ==>
const applyDataRowStyle = (row: ExcelJS.Row, isAlternate: boolean = false) => {
  // ITERATE THROUGH CELLS
  row.eachCell((cell) => {
    // SET FONT
    cell.font = {
      color: { argb: BRAND_COLORS.darkText },
      size: 10,
    };
    // SET FILL
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: isAlternate ? BRAND_COLORS.lightGray : BRAND_COLORS.white,
      },
    };
    // SET ALIGNMENT
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
    };
    // SET BORDER
    cell.border = {
      top: { style: "thin", color: { argb: BRAND_COLORS.mediumGray } },
      bottom: { style: "thin", color: { argb: BRAND_COLORS.mediumGray } },
      left: { style: "thin", color: { argb: BRAND_COLORS.mediumGray } },
      right: { style: "thin", color: { argb: BRAND_COLORS.mediumGray } },
    };
  });
  // SET ROW HEIGHT
  row.height = 22;
};

// <== CREATE TITLE ROW HELPER ==>
const createTitleRow = (
  worksheet: ExcelJS.Worksheet,
  title: string,
  colSpan: number
) => {
  // ADD TITLE ROW
  const titleRow = worksheet.addRow([title]);
  // MERGE CELLS
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, colSpan);
  // GET CELL
  const cell = titleRow.getCell(1);
  // SET FONT
  cell.font = {
    bold: true,
    size: 16,
    color: { argb: BRAND_COLORS.white },
  };
  // SET FILL
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BRAND_COLORS.darkBg },
  };
  // SET ALIGNMENT
  cell.alignment = {
    vertical: "middle",
    horizontal: "center",
  };
  // SET ROW HEIGHT
  titleRow.height = 36;
  // RETURN TITLE ROW
  return titleRow;
};

// <== CREATE SECTION HEADER HELPER ==>
const createSectionHeader = (
  worksheet: ExcelJS.Worksheet,
  title: string,
  colSpan: number
) => {
  // ADD EMPTY ROW
  worksheet.addRow([]);
  // ADD SECTION HEADER ROW
  const headerRow = worksheet.addRow([title]);
  // MERGE CELLS
  worksheet.mergeCells(headerRow.number, 1, headerRow.number, colSpan);
  // GET CELL
  const cell = headerRow.getCell(1);
  // SET FONT
  cell.font = {
    bold: true,
    size: 12,
    color: { argb: BRAND_COLORS.primary },
  };
  // SET FILL
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "F5F3FF" },
  };
  // SET BORDER
  cell.border = {
    left: { style: "medium", color: { argb: BRAND_COLORS.primary } },
  };
  // SET ALIGNMENT
  cell.alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  // SET ROW HEIGHT
  headerRow.height = 28;
  // RETURN HEADER ROW
  return headerRow;
};

// <== CREATE STAT CARD ROW HELPER ==>
const createStatRow = (
  worksheet: ExcelJS.Worksheet,
  label: string,
  value: string | number,
  valueColor: string = BRAND_COLORS.darkText
) => {
  // ADD ROW
  const row = worksheet.addRow([label, value]);
  // STYLE LABEL CELL
  const labelCell = row.getCell(1);
  // SET FONT
  labelCell.font = {
    size: 10,
    color: { argb: BRAND_COLORS.lightText },
  };
  // SET ALIGNMENT
  labelCell.alignment = { vertical: "middle", horizontal: "left" };
  // STYLE VALUE CELL
  const valueCell = row.getCell(2);
  // SET FONT
  valueCell.font = {
    bold: true,
    size: 11,
    color: { argb: valueColor },
  };
  // SET ALIGNMENT
  valueCell.alignment = { vertical: "middle", horizontal: "right" };
  // SET ROW HEIGHT
  row.height = 22;
  // RETURN ROW
  return row;
};

// <== GET STATUS COLOR HELPER ==>
const getStatusColor = (status: string): string => {
  // SWITCH ON STATUS
  switch (status?.toLowerCase()) {
    // COMPLETED
    case "completed":
      // RETURN SUCCESS COLOR
      return BRAND_COLORS.success;
    // IN PROGRESS
    case "in progress":
      // RETURN INFO COLOR
      return BRAND_COLORS.info;
    case "pending":
      // RETURN WARNING COLOR
      return BRAND_COLORS.warning;
    default:
      // RETURN LIGHT TEXT COLOR
      return BRAND_COLORS.lightText;
  }
};

// <== GET PRIORITY COLOR HELPER ==>
const getPriorityColor = (priority: string): string => {
  // SWITCH ON PRIORITY
  switch (priority?.toLowerCase()) {
    // HIGH
    case "high":
      // RETURN DANGER COLOR
      return BRAND_COLORS.danger;
    // MEDIUM
    case "medium":
      // RETURN WARNING COLOR
      return BRAND_COLORS.warning;
    case "low":
      // RETURN SUCCESS COLOR
      return BRAND_COLORS.success;
    default:
      // RETURN LIGHT TEXT COLOR
      return BRAND_COLORS.lightText;
  }
};

/**
 * EXPORT PERSONAL REPORT TO EXCEL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT PERSONAL REPORT TO EXCEL ==>
export const exportPersonalReportToExcel = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // GET USER INFO
    const user = await User.findById(userObjectId)
      .select("name email")
      .lean()
      .exec();
    // IF USER NOT FOUND, RETURN 404 ERROR
    if (!user) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "User not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET TASK STATISTICS
    const taskStats = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $gte: ["$completedAt", startDate] },
                    { $lte: ["$completedAt", endDate] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          // IN PROGRESS TASKS
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          // PENDING TASKS
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          // OVERDUE TASKS
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "completed"] },
                    { $lt: ["$dueDate", new Date()] },
                    { $ne: ["$dueDate", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          // HIGH PRIORITY COMPLETED TASKS
          highPriorityCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $eq: ["$priority", "high"] },
                    { $gte: ["$completedAt", startDate] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    // PRIORITY DISTRIBUTION
    const priorityDistribution = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // MOST PRODUCTIVE DAY
    const productiveDay = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: { $dayOfWeek: "$completedAt" },
          count: { $sum: 1 },
        },
      },
      // SORT BY COUNT DESCENDING
      { $sort: { count: -1 } },
      // LIMIT TO 1
      { $limit: 1 },
    ]).exec();
    // MOST PRODUCTIVE HOUR
    const productiveHour = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: { $hour: "$completedAt" },
          count: { $sum: 1 },
        },
      },
      // SORT BY COUNT DESCENDING
      { $sort: { count: -1 } },
      // LIMIT TO 1
      { $limit: 1 },
    ]).exec();
    // FOCUS SESSION STATS
    const focusStats = await FocusSession.aggregate([
      // MATCH USER ID AND STARTED AT IN PERIOD
      {
        $match: {
          userId: userObjectId,
          startedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET STATS
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          completedSessions: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          totalDuration: { $sum: "$duration" },
          totalPomodoros: { $sum: "$pomodorosCompleted" },
        },
      },
    ]).exec();
    // PROJECT TASK DISTRIBUTION
    const projectDistribution = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // LOOKUP PROJECT
      {
        $lookup: {
          from: "projects",
          localField: "projectId",
          foreignField: "_id",
          as: "project",
        },
      },
      // UNWIND PROJECT
      {
        $unwind: {
          path: "$project",
          preserveNullAndEmptyArrays: true,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$projectId",
          projectName: { $first: "$project.title" },
          count: { $sum: 1 },
        },
      },
      // SORT BY COUNT DESCENDING
      { $sort: { count: -1 } },
      // LIMIT TO 10
      { $limit: 10 },
    ]).exec();
    // CALCULATE METRICS
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
      highPriorityCompleted: 0,
    };
    // FOCUS SESSION STATS
    const focus = focusStats[0] || {
      totalSessions: 0,
      completedSessions: 0,
      totalDuration: 0,
      totalPomodoros: 0,
    };
    // CALCULATE COMPLETION RATE
    const totalTracked =
      stats.completedTasks + stats.inProgressTasks + stats.pendingTasks;
    // CALCULATE COMPLETION RATE
    const completionRate =
      totalTracked > 0
        ? Math.round((stats.completedTasks / totalTracked) * 100)
        : 0;
    // CALCULATE VELOCITY
    const weeksInPeriod =
      period === "week"
        ? 1
        : period === "month"
        ? 4
        : period === "quarter"
        ? 13
        : 52;
    // CALCULATE VELOCITY
    const velocity =
      weeksInPeriod > 0
        ? Math.round((stats.completedTasks / weeksInPeriod) * 10) / 10
        : 0;
    // CREATE EXCEL WORKBOOK
    const workbook = new ExcelJS.Workbook();
    // SET CREATOR
    workbook.creator = "PlanOra";
    // SET CREATED DATE
    workbook.created = new Date();
    // SUMMARY SHEET
    const summarySheet = workbook.addWorksheet("Summary", {
      properties: { tabColor: { argb: BRAND_COLORS.primary } },
    });
    // SET COLUMN WIDTHS
    summarySheet.columns = [
      { width: 30 },
      { width: 25 },
      { width: 20 },
      { width: 20 },
    ];
    // CREATE TITLE
    createTitleRow(summarySheet, "PlanOra - Personal Productivity Report", 4);
    // ADD REPORT INFORMATION SECTION
    createSectionHeader(summarySheet, "📋 Report Information", 4);
    // ADD USER INFORMATION
    createStatRow(summarySheet, "User", user.name || "N/A");
    // ADD EMAIL INFORMATION
    createStatRow(summarySheet, "Email", user.email || "N/A");
    // ADD PERIOD INFORMATION
    createStatRow(summarySheet, "Period", getPeriodLabel(period));
    // ADD DATE RANGE INFORMATION
    createStatRow(
      summarySheet,
      "Date Range",
      `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
    );
    // ADD GENERATED AT INFORMATION
    createStatRow(summarySheet, "Generated At", new Date().toLocaleString());
    // ADD TASK SUMMARY SECTION
    createSectionHeader(summarySheet, "✅ Task Summary", 4);
    // ADD TOTAL TASKS
    createStatRow(summarySheet, "Total Tasks", stats.totalTasks);
    // ADD COMPLETED TASKS
    createStatRow(
      summarySheet,
      "Completed Tasks",
      stats.completedTasks,
      BRAND_COLORS.success
    );
    // ADD IN PROGRESS TASKS
    createStatRow(
      summarySheet,
      "In Progress Tasks",
      stats.inProgressTasks,
      BRAND_COLORS.info
    );
    // ADD PENDING TASKS
    createStatRow(
      summarySheet,
      "Pending Tasks",
      stats.pendingTasks,
      BRAND_COLORS.warning
    );
    // ADD OVERDUE TASKS
    createStatRow(
      summarySheet,
      "Overdue Tasks",
      stats.overdueTasks,
      BRAND_COLORS.danger
    );
    // ADD COMPLETION RATE
    createStatRow(
      summarySheet,
      "Completion Rate",
      `${completionRate}%`,
      BRAND_COLORS.primary
    );
    // ADD VELOCITY
    createStatRow(summarySheet, "Velocity (tasks/week)", velocity);
    // ADD HIGH PRIORITY COMPLETED TASKS
    createStatRow(
      summarySheet,
      "High Priority Completed",
      stats.highPriorityCompleted,
      BRAND_COLORS.danger
    );
    // ADD FOCUS SESSION STATS SECTION
    createSectionHeader(summarySheet, "Focus Session Stats", 4);
    // ADD TOTAL SESSIONS
    createStatRow(summarySheet, "Total Sessions", focus.totalSessions);
    // ADD COMPLETED SESSIONS
    createStatRow(
      summarySheet,
      "Completed Sessions",
      focus.completedSessions,
      BRAND_COLORS.success
    );
    // ADD TOTAL FOCUS TIME
    createStatRow(
      summarySheet,
      "Total Focus Time",
      formatDuration(Math.round(focus.totalDuration))
    );
    // ADD AVERAGE SESSION LENGTH
    createStatRow(
      summarySheet,
      "Average Session Length",
      focus.totalSessions > 0
        ? formatDuration(Math.round(focus.totalDuration / focus.totalSessions))
        : "N/A"
    );
    // ADD TOTAL POMODOROS
    createStatRow(
      summarySheet,
      "Total Pomodoros",
      focus.totalPomodoros,
      BRAND_COLORS.primary
    );
    // ADD PRODUCTIVITY INSIGHTS SECTION
    createSectionHeader(summarySheet, "💡 Productivity Insights", 4);
    // ADD MOST PRODUCTIVE DAY
    createStatRow(
      summarySheet,
      "Most Productive Day",
      productiveDay[0] ? getDayName(productiveDay[0]._id - 1) : "N/A"
    );
    // ADD MOST PRODUCTIVE HOUR
    createStatRow(
      summarySheet,
      "Most Productive Hour",
      productiveHour[0] ? formatHour(productiveHour[0]._id) : "N/A"
    );
    // ADD PRIORITY DISTRIBUTION SECTION
    const prioritySheet = workbook.addWorksheet("Priority Distribution", {
      properties: { tabColor: { argb: BRAND_COLORS.warning } },
    });
    // SET COLUMN WIDTHS
    prioritySheet.columns = [{ width: 20 }, { width: 15 }, { width: 20 }];
    // CREATE TITLE
    createTitleRow(prioritySheet, "Priority Distribution", 3);
    // ADD EMPTY ROW
    prioritySheet.addRow([]);
    // ADD HEADER ROW
    const priorityHeaderRow = prioritySheet.addRow([
      "Priority",
      "Count",
      "Percentage",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(priorityHeaderRow);
    // CALCULATE TOTAL
    const totalPriority = priorityDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );
    // ADD DATA ROWS
    priorityDistribution.forEach((item, index) => {
      // CALCULATE PERCENTAGE
      const percentage =
        totalPriority > 0 ? Math.round((item.count / totalPriority) * 100) : 0;
      // ADD DATA ROW
      const row = prioritySheet.addRow([
        item._id || "No Priority",
        item.count,
        `${percentage}%`,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR THE PRIORITY CELL
      row.getCell(1).font = {
        bold: true,
        color: { argb: getPriorityColor(item._id) },
      };
    });
    // ADD PROJECT DISTRIBUTION SECTION
    const projectSheet = workbook.addWorksheet("Project Distribution", {
      properties: { tabColor: { argb: BRAND_COLORS.info } },
    });
    // SET COLUMN WIDTHS
    projectSheet.columns = [{ width: 35 }, { width: 18 }, { width: 18 }];
    // CREATE TITLE
    createTitleRow(projectSheet, "Tasks by Project", 3);
    // ADD EMPTY ROW
    projectSheet.addRow([]);
    // ADD HEADER ROW
    const projectHeaderRow = projectSheet.addRow([
      "Project",
      "Tasks Completed",
      "Percentage",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(projectHeaderRow, BRAND_COLORS.info);
    // CALCULATE TOTAL PROJECTS
    const totalProject = projectDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );
    // ADD DATA ROWS
    projectDistribution.forEach((item, index) => {
      // CALCULATE PERCENTAGE
      const percentage =
        totalProject > 0 ? Math.round((item.count / totalProject) * 100) : 0;
      // ADD DATA ROW
      const row = projectSheet.addRow([
        item.projectName || "Unassigned",
        item.count,
        `${percentage}%`,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
    });

    // WRITE EXCEL BUFFER
    const excelBuffer = await workbook.xlsx.writeBuffer();
    // SET RESPONSE HEADERS
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // SET CONTENT DISPOSITION
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=planora-personal-report-${period}.xlsx`
    );
    // SEND EXCEL BUFFER
    res.send(excelBuffer);
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * EXPORT PROJECT REPORT TO EXCEL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT PROJECT REPORT TO EXCEL ==>
export const exportProjectReportToExcel = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING PROJECT ID FROM REQUEST PARAMS
    const { projectId } = req.params;
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // PROJECT OBJECT ID
    const projectObjectId = new mongoose.Types.ObjectId(String(projectId));
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // VERIFY PROJECT OWNERSHIP
    const project = await Project.findOne({
      _id: projectObjectId,
      userId: userObjectId,
      isTrashed: false,
    })
      .lean()
      .exec();
    // IF PROJECT NOT FOUND, RETURN 404 ERROR
    if (!project) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Project not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TASK STATISTICS FOR PROJECT
    const taskStats = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          // COMPLETED TASKS
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          // IN PROGRESS TASKS
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          // PENDING TASKS
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          // OVERDUE TASKS
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "completed"] },
                    { $lt: ["$dueDate", new Date()] },
                    { $ne: ["$dueDate", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    // STATUS DISTRIBUTION
    const statusDistribution = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // PRIORITY DISTRIBUTION
    const priorityDistribution = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // FIND ALL TASKS FOR DETAILED LIST
    const allTasks = await Task.find({
      projectId: projectObjectId,
      userId: userObjectId,
      isTrashed: false,
    })
      .select("title status priority dueDate createdAt completedAt")
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    // CALCULATE METRICS
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
    };
    // CALCULATE PROGRESS PERCENTAGE
    const progressPercentage =
      stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;
    // CREATE EXCEL WORKBOOK
    const workbook = new ExcelJS.Workbook();
    // SET CREATOR
    workbook.creator = "PlanOra";
    // SET CREATED DATE
    workbook.created = new Date();
    // SUMMARY SHEET
    const summarySheet = workbook.addWorksheet("Summary", {
      properties: { tabColor: { argb: BRAND_COLORS.primary } },
    });
    summarySheet.columns = [{ width: 28 }, { width: 35 }];
    // CREATE TITLE
    createTitleRow(summarySheet, `Project Report: ${project.title}`, 2);
    // ADD PROJECT INFO SECTION
    createSectionHeader(summarySheet, "📋 Project Information", 2);
    // ADD PROJECT NAME
    createStatRow(summarySheet, "Project Name", project.title);
    // ADD PROJECT DESCRIPTION
    createStatRow(
      summarySheet,
      "Description",
      (project.description as string) || "N/A"
    );
    // ADD PROJECT STATUS
    createStatRow(summarySheet, "Status", project.status);
    // ADD PROJECT DUE DATE
    createStatRow(
      summarySheet,
      "Due Date",
      project.dueDate ? new Date(project.dueDate).toLocaleDateString() : "N/A"
    );
    // ADD PERIOD
    createStatRow(summarySheet, "Period", getPeriodLabel(period));
    // ADD DATE RANGE
    createStatRow(
      summarySheet,
      "Date Range",
      `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
    );
    // ADD GENERATED AT
    createStatRow(summarySheet, "Generated At", new Date().toLocaleString());
    // ADD TASK SUMMARY SECTION
    createSectionHeader(summarySheet, "✅ Task Summary", 2);
    // ADD TOTAL TASKS
    createStatRow(summarySheet, "Total Tasks", stats.totalTasks);
    // ADD COMPLETED TASKS
    createStatRow(
      summarySheet,
      "Completed Tasks",
      stats.completedTasks,
      BRAND_COLORS.success
    );
    // ADD IN PROGRESS TASKS
    createStatRow(
      summarySheet,
      "In Progress Tasks",
      stats.inProgressTasks,
      BRAND_COLORS.info
    );
    // ADD PENDING TASKS
    createStatRow(
      summarySheet,
      "Pending Tasks",
      stats.pendingTasks,
      BRAND_COLORS.warning
    );
    // ADD OVERDUE TASKS
    createStatRow(
      summarySheet,
      "Overdue Tasks",
      stats.overdueTasks,
      BRAND_COLORS.danger
    );
    // ADD PROGRESS PERCENTAGE
    createStatRow(
      summarySheet,
      "Progress",
      `${progressPercentage}%`,
      BRAND_COLORS.primary
    );
    // ADD REMAINING TASKS
    createStatRow(
      summarySheet,
      "Remaining Tasks",
      stats.totalTasks - stats.completedTasks
    );
    // ADD STATUS DISTRIBUTION SECTION
    const statusSheet = workbook.addWorksheet("Status Distribution", {
      properties: { tabColor: { argb: BRAND_COLORS.info } },
    });
    // SET COLUMN WIDTHS
    statusSheet.columns = [{ width: 20 }, { width: 15 }, { width: 20 }];
    // CREATE TITLE
    createTitleRow(statusSheet, "Status Distribution", 3);
    // ADD EMPTY ROW
    statusSheet.addRow([]);
    // ADD HEADER ROW
    const statusHeaderRow = statusSheet.addRow([
      "Status",
      "Count",
      "Percentage",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(statusHeaderRow, BRAND_COLORS.info);
    // CALCULATE TOTAL STATUS
    const totalStatus = statusDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );
    // ADD DATA ROWS
    statusDistribution.forEach((item, index) => {
      // CALCULATE PERCENTAGE
      const percentage =
        totalStatus > 0 ? Math.round((item.count / totalStatus) * 100) : 0;
      // ADD DATA ROW
      const row = statusSheet.addRow([
        item._id || "No Status",
        item.count,
        `${percentage}%`,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR THE STATUS CELL
      row.getCell(1).font = {
        bold: true,
        color: { argb: getStatusColor(item._id) },
      };
    });
    // ADD PRIORITY DISTRIBUTION SECTION
    const prioritySheet = workbook.addWorksheet("Priority Distribution", {
      properties: { tabColor: { argb: BRAND_COLORS.warning } },
    });
    // SET COLUMN WIDTHS
    prioritySheet.columns = [{ width: 20 }, { width: 15 }, { width: 20 }];
    // CREATE TITLE
    createTitleRow(prioritySheet, "Priority Distribution", 3);
    // ADD EMPTY ROW
    prioritySheet.addRow([]);
    // ADD HEADER ROW
    const priorityHeaderRow = prioritySheet.addRow([
      "Priority",
      "Count",
      "Percentage",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(priorityHeaderRow, BRAND_COLORS.warning);
    // CALCULATE TOTAL PRIORITY
    const totalPriority = priorityDistribution.reduce(
      (sum, item) => sum + item.count,
      0
    );
    // ADD DATA ROWS
    priorityDistribution.forEach((item, index) => {
      // CALCULATE PERCENTAGE
      const percentage =
        totalPriority > 0 ? Math.round((item.count / totalPriority) * 100) : 0;
      // ADD DATA ROW
      const row = prioritySheet.addRow([
        item._id || "No Priority",
        item.count,
        `${percentage}%`,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR THE PRIORITY CELL
      row.getCell(1).font = {
        bold: true,
        color: { argb: getPriorityColor(item._id) },
      };
    });
    // ADD ALL TASKS SECTION
    const tasksSheet = workbook.addWorksheet("All Tasks", {
      properties: { tabColor: { argb: BRAND_COLORS.success } },
    });
    // SET COLUMN WIDTHS
    tasksSheet.columns = [
      { width: 40 },
      { width: 15 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];
    // CREATE TITLE
    createTitleRow(tasksSheet, "All Project Tasks", 6);
    // ADD EMPTY ROW
    tasksSheet.addRow([]);
    // ADD HEADER ROW
    const tasksHeaderRow = tasksSheet.addRow([
      "Title",
      "Status",
      "Priority",
      "Due Date",
      "Created At",
      "Completed At",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(tasksHeaderRow, BRAND_COLORS.success);
    // ADD DATA ROWS
    allTasks.forEach((task, index) => {
      // ADD DATA ROW
      const row = tasksSheet.addRow([
        task.title,
        task.status,
        task.priority,
        task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "N/A",
        new Date(task.createdAt).toLocaleDateString(),
        task.completedAt
          ? new Date(task.completedAt).toLocaleDateString()
          : "N/A",
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR STATUS CELL
      row.getCell(2).font = {
        bold: true,
        color: { argb: getStatusColor(task.status) },
      };
      // COLOR PRIORITY CELL
      row.getCell(3).font = {
        bold: true,
        color: { argb: getPriorityColor(task.priority) },
      };
    });
    // GENERATE EXCEL BUFFER
    const excelBuffer = await workbook.xlsx.writeBuffer();
    // SET RESPONSE HEADERS
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // SANITIZE PROJECT NAME
    const sanitizedProjectName = project.title
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase();
    // SET CONTENT DISPOSITION
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=planora-project-${sanitizedProjectName}-${period}.xlsx`
    );
    // SEND EXCEL BUFFER
    res.send(excelBuffer);
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * EXPORT WORKSPACE REPORT TO EXCEL
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT WORKSPACE REPORT TO EXCEL ==>
export const exportWorkspaceReportToExcel = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING WORKSPACE ID FROM REQUEST PARAMS
    const { workspaceId } = req.params;
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // WORKSPACE OBJECT ID
    const workspaceObjectId = new mongoose.Types.ObjectId(String(workspaceId));
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // VERIFY USER IS A MEMBER OF THE WORKSPACE
    const membership = await WorkspaceMember.findOne({
      workspaceId: workspaceObjectId,
      userId: userObjectId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER OF THE WORKSPACE, RETURN 403 ERROR
    if (!membership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET WORKSPACE DETAILS
    const workspace = await Workspace.findById(workspaceObjectId)
      .select("name description visibility")
      .lean()
      .exec();
    // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
    if (!workspace) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Workspace not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET ALL WORKSPACE MEMBERS
    const members = await WorkspaceMember.find({
      workspaceId: workspaceObjectId,
      status: "active",
    })
      .populate("userId", "name email")
      .lean()
      .exec();
    // GET MEMBER USER IDS AS OBJECT IDS
    const memberUserIds: mongoose.Types.ObjectId[] = [];
    // LOOP THROUGH MEMBERS AND GET USER IDS
    for (const member of members) {
      // IF USER ID IS PROVIDED AND IS AN OBJECT
      if (member.userId && typeof member.userId === "object") {
        // CAST TO UNKNOWN FIRST TO AVOID TYPE INCOMPATIBILITY
        const populatedUser = member.userId as unknown as {
          _id: mongoose.Types.ObjectId;
        };
        // IF USER ID IS PROVIDED AND IS AN OBJECT ID
        if (populatedUser._id) {
          // PUSH USER ID TO ARRAY
          memberUserIds.push(
            new mongoose.Types.ObjectId(String(populatedUser._id))
          );
        }
      }
    }
    // WORKSPACE PROJECTS
    const workspaceProjectDocs = await Project.find({
      workspaceId: workspaceObjectId,
      isTrashed: false,
    })
      .select("_id title status")
      .lean<{ _id: mongoose.Types.ObjectId; title: string; status: string }[]>()
      .exec();
    // GET PROJECT IDS
    const projectIds = workspaceProjectDocs.map((p) => p._id);
    // TASK STATISTICS FOR WORKSPACE (FROM WORKSPACE PROJECTS)
    const taskStats = await Task.aggregate([
      // MATCH PROJECT IDS AND NOT TRASHED
      {
        $match: {
          projectId: { $in: projectIds },
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          // COMPLETED TASKS
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          // IN PROGRESS TASKS
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          // PENDING TASKS
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          // OVERDUE TASKS
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "completed"] },
                    { $lt: ["$dueDate", new Date()] },
                    { $ne: ["$dueDate", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          // COMPLETED IN PERIOD
          completedInPeriod: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $gte: ["$completedAt", startDate] },
                    { $lte: ["$completedAt", endDate] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    // MEMBER CONTRIBUTION BREAKDOWN (FROM WORKSPACE PROJECTS)
    const memberContributions = await Task.aggregate([
      // MATCH PROJECT IDS AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD AND ASSIGNEE ID IN MEMBER USER IDS
      {
        $match: {
          projectId: { $in: projectIds },
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
          assigneeId: { $in: memberUserIds },
        },
      },
      // LOOKUP ASSIGNEE
      {
        $lookup: {
          from: "users",
          localField: "assigneeId",
          foreignField: "_id",
          as: "assignee",
        },
      },
      // UNWIND ASSIGNEE
      {
        $unwind: {
          path: "$assignee",
          preserveNullAndEmptyArrays: true,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$assigneeId",
          name: { $first: "$assignee.name" },
          tasksCompleted: { $sum: 1 },
          highPriority: {
            $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] },
          },
        },
      },
      // SORT BY TASKS COMPLETED DESCENDING
      { $sort: { tasksCompleted: -1 } },
    ]).exec();
    // PROJECT STATUS BREAKDOWN (FROM WORKSPACE PROJECTS)
    const projectStatus = await Project.aggregate([
      // MATCH WORKSPACE ID AND NOT TRASHED
      {
        $match: {
          workspaceId: workspaceObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // CALCULATE METRICS (FROM WORKSPACE PROJECTS)
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
      completedInPeriod: 0,
    };
    // CALCULATE COMPLETION RATE
    const completionRate =
      stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;
    // CALCULATE WEEKS IN PERIOD
    const weeksInPeriod =
      period === "week"
        ? 1
        : period === "month"
        ? 4
        : period === "quarter"
        ? 13
        : 52;
    // CALCULATE TEAM VELOCITY
    const teamVelocity =
      weeksInPeriod > 0
        ? Math.round((stats.completedInPeriod / weeksInPeriod) * 10) / 10
        : 0;
    // CREATE EXCEL WORKBOOK
    const workbook = new ExcelJS.Workbook();
    // SET CREATOR
    workbook.creator = "PlanOra";
    // SET CREATED DATE
    workbook.created = new Date();
    // SUMMARY SHEET
    const summarySheet = workbook.addWorksheet("Summary", {
      properties: { tabColor: { argb: BRAND_COLORS.primary } },
    });
    // SET COLUMN WIDTHS
    summarySheet.columns = [{ width: 28 }, { width: 30 }];
    // CREATE TITLE
    createTitleRow(summarySheet, `🏢 Workspace Report: ${workspace.name}`, 2);
    // ADD WORKSPACE INFO SECTION
    createSectionHeader(summarySheet, "📋 Workspace Information", 2);
    // ADD WORKSPACE NAME
    createStatRow(summarySheet, "Workspace Name", workspace.name);
    // ADD WORKSPACE DESCRIPTION
    createStatRow(
      summarySheet,
      "Description",
      (workspace.description as string) || "N/A"
    );
    // ADD VISIBILITY
    createStatRow(summarySheet, "Visibility", workspace.visibility as string);
    // ADD TOTAL MEMBERS
    createStatRow(summarySheet, "Total Members", members.length);
    // ADD TOTAL PROJECTS
    createStatRow(summarySheet, "Total Projects", projectIds.length);
    // ADD PERIOD
    createStatRow(summarySheet, "Period", getPeriodLabel(period));
    // ADD DATE RANGE
    createStatRow(
      summarySheet,
      "Date Range",
      `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
    );
    // ADD GENERATED AT
    createStatRow(summarySheet, "Generated At", new Date().toLocaleString());
    // ADD TASK SUMMARY SECTION
    createSectionHeader(summarySheet, "✅ Task Summary", 2);
    // ADD TOTAL TASKS
    createStatRow(summarySheet, "Total Tasks", stats.totalTasks);
    // ADD COMPLETED TASKS
    createStatRow(
      summarySheet,
      "Completed Tasks",
      stats.completedTasks,
      BRAND_COLORS.success
    );
    // ADD IN PROGRESS TASKS
    createStatRow(
      summarySheet,
      "In Progress Tasks",
      stats.inProgressTasks,
      BRAND_COLORS.info
    );
    // ADD PENDING TASKS
    createStatRow(
      summarySheet,
      "Pending Tasks",
      stats.pendingTasks,
      BRAND_COLORS.warning
    );
    // ADD OVERDUE TASKS
    createStatRow(
      summarySheet,
      "Overdue Tasks",
      stats.overdueTasks,
      BRAND_COLORS.danger
    );
    // ADD COMPLETED IN PERIOD
    createStatRow(
      summarySheet,
      "Completed in Period",
      stats.completedInPeriod,
      BRAND_COLORS.success
    );
    // ADD COMPLETION RATE
    createStatRow(
      summarySheet,
      "Completion Rate",
      `${completionRate}%`,
      BRAND_COLORS.primary
    );
    // ADD TEAM VELOCITY
    createStatRow(
      summarySheet,
      "Team Velocity (tasks/week)",
      teamVelocity,
      BRAND_COLORS.primary
    );
    // ADD TEAM MEMBERS SHEET
    const membersSheet = workbook.addWorksheet("Team Members", {
      properties: { tabColor: { argb: BRAND_COLORS.info } },
    });
    // SET COLUMN WIDTHS
    membersSheet.columns = [
      { width: 25 },
      { width: 25 },
      { width: 15 },
      { width: 18 },
      { width: 15 },
    ];
    // CREATE TITLE
    createTitleRow(membersSheet, "Team Members & Contributions", 5);
    // ADD EMPTY ROW
    membersSheet.addRow([]);
    // ADD HEADER ROW
    const membersHeaderRow = membersSheet.addRow([
      "Member",
      "Email",
      "Role",
      "Tasks Completed",
      "High Priority",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(membersHeaderRow, BRAND_COLORS.info);
    // CREATE CONTRIBUTION MAP
    const contributionMap = new Map(
      memberContributions.map((c) => [String(c._id), c])
    );
    // ADD DATA ROWS
    members.forEach((member, index) => {
      // GET USER DATA
      const userData = member.userId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        email: string;
      };
      // GET CONTRIBUTION
      const contribution = contributionMap.get(String(userData._id));
      // ADD DATA ROW
      const row = membersSheet.addRow([
        userData.name || "N/A",
        userData.email || "N/A",
        member.role,
        contribution?.tasksCompleted || 0,
        contribution?.highPriority || 0,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR TOP CONTRIBUTOR
      if (index === 0 && contribution?.tasksCompleted > 0) {
        // COLOR HIGH PRIORITY CELL
        row.getCell(4).font = {
          bold: true,
          color: { argb: BRAND_COLORS.success },
        };
      }
    });
    // ADD PROJECTS SHEET
    const projectsSheet = workbook.addWorksheet("Projects", {
      properties: { tabColor: { argb: BRAND_COLORS.warning } },
    });
    // SET COLUMN WIDTHS
    projectsSheet.columns = [{ width: 40 }, { width: 20 }];
    // CREATE TITLE
    createTitleRow(projectsSheet, "Workspace Projects", 2);
    // ADD EMPTY ROW
    projectsSheet.addRow([]);
    // ADD HEADER ROW
    const projectsHeaderRow = projectsSheet.addRow(["Project Name", "Status"]);
    // APPLY HEADER STYLE
    applyHeaderStyle(projectsHeaderRow, BRAND_COLORS.warning);
    // ADD DATA ROWS
    workspaceProjectDocs.forEach((project, index) => {
      // ADD DATA ROW
      const row = projectsSheet.addRow([project.title, project.status]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR STATUS CELL
      row.getCell(2).font = {
        bold: true,
        color: { argb: getStatusColor(project.status) },
      };
    });
    // ADD PROJECT STATUS SHEET
    const statusSheet = workbook.addWorksheet("Project Status", {
      properties: { tabColor: { argb: BRAND_COLORS.success } },
    });
    // SET COLUMN WIDTHS
    statusSheet.columns = [{ width: 20 }, { width: 15 }, { width: 20 }];
    // CREATE TITLE
    createTitleRow(statusSheet, "Project Status Distribution", 3);
    // ADD EMPTY ROW
    statusSheet.addRow([]);
    // ADD HEADER ROW
    const statusHeaderRow = statusSheet.addRow([
      "Status",
      "Count",
      "Percentage",
    ]);
    // APPLY HEADER STYLE
    applyHeaderStyle(statusHeaderRow, BRAND_COLORS.success);
    // CALCULATE TOTAL STATUS COUNT
    const totalStatusCount = projectStatus.reduce(
      (sum, item) => sum + item.count,
      0
    );
    // ADD DATA ROWS
    projectStatus.forEach((item, index) => {
      // CALCULATE PERCENTAGE
      const percentage =
        totalStatusCount > 0
          ? Math.round((item.count / totalStatusCount) * 100)
          : 0;
      // ADD DATA ROW
      const row = statusSheet.addRow([
        item._id || "No Status",
        item.count,
        `${percentage}%`,
      ]);
      // APPLY DATA ROW STYLE
      applyDataRowStyle(row, index % 2 === 1);
      // COLOR STATUS CELL
      row.getCell(1).font = {
        bold: true,
        color: { argb: getStatusColor(item._id) },
      };
    });
    // WRITE EXCEL BUFFER
    const excelBuffer = await workbook.xlsx.writeBuffer();
    // SET CONTENT TYPE
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // SANITIZE WORKSPACE NAME
    const sanitizedWorkspaceName = workspace.name
      .replace(/[^a-z0-9]/gi, "-")
      .toLowerCase();
    // SET CONTENT DISPOSITION
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=planora-workspace-${sanitizedWorkspaceName}-${period}.xlsx`
    );
    // SEND EXCEL BUFFER
    res.send(excelBuffer);
    // RETURN FROM FUNCTION
    return;
  }
);

/**
 * CREATE SHAREABLE REPORT LINK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== CREATE SHAREABLE REPORT LINK ==>
export const createShareableLink = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING REPORT TYPE FROM REQUEST BODY
  const { reportType, projectId, workspaceId, period, expiresInDays } =
    req.body as {
      reportType: ReportType;
      projectId?: string;
      workspaceId?: string;
      period: ReportPeriod;
      expiresInDays: number;
    };
  // IF REPORT TYPE IS NOT PROVIDED OR IS NOT A VALID REPORT TYPE, RETURN 400 ERROR
  if (
    !reportType ||
    !["personal", "project", "workspace"].includes(reportType)
  ) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Invalid report type!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE PROJECT ID FOR PROJECT REPORTS
  if (reportType === "project" && !projectId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Project ID is required for project reports!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // VALIDATE WORKSPACE ID FOR WORKSPACE REPORTS
  if (reportType === "workspace" && !workspaceId) {
    // RETURNING ERROR RESPONSE
    res.status(400).json({
      message: "Workspace ID is required for workspace reports!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GENERATE UNIQUE SHARE TOKEN
  const shareToken = uuidv4();
  // CALCULATE EXPIRY DATE
  const expiresAt = new Date();
  // SET EXPIRY DATE
  expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));
  // CREATE SHARED REPORT DOCUMENT
  const sharedReport = await SharedReport.create({
    userId: new mongoose.Types.ObjectId(String(userId)),
    reportType,
    projectId: projectId
      ? new mongoose.Types.ObjectId(String(projectId))
      : undefined,
    workspaceId: workspaceId
      ? new mongoose.Types.ObjectId(String(workspaceId))
      : undefined,
    period: period || "month",
    shareToken,
    expiresAt,
  });
  // SET BASE URL
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  // GENERATE SHARE URL
  const shareUrl = `${baseUrl}/shared-report/${shareToken}`;
  // RETURN SUCCESS RESPONSE
  res.status(201).json({
    success: true,
    message: "Shareable link created successfully!",
    shareUrl,
    expiresAt,
    shareToken: sharedReport.shareToken,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET SHARED REPORT
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET SHARED REPORT ==>
export const getSharedReport = expressAsyncHandler(async (req, res) => {
  // GETTING SHARE TOKEN FROM REQUEST PARAMS
  const { shareToken } = req.params;
  // FIND SHARED REPORT DOCUMENT
  const sharedReport = await SharedReport.findOne({
    shareToken,
    isActive: true,
    expiresAt: { $gt: new Date() },
  })
    .lean()
    .exec();
  // IF SHARED REPORT DOCUMENT NOT FOUND, RETURN 404 ERROR
  if (!sharedReport) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Report not found or link has expired!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // UPDATE ACCESS COUNT AND LAST ACCESSED
  await SharedReport.findByIdAndUpdate(sharedReport._id, {
    $inc: { accessCount: 1 },
    lastAccessedAt: new Date(),
  });
  // GET DATE RANGE
  const { startDate, endDate } = getDateRange(
    sharedReport.period as ReportPeriod
  );
  // USER OBJECT ID
  const userObjectId = sharedReport.userId as mongoose.Types.ObjectId;
  // GET REPORT DATA BASED ON TYPE
  let reportData: Record<string, unknown> = {};
  // SWITCH ON REPORT TYPE
  switch (sharedReport.reportType) {
    // PERSONAL REPORT
    case "personal": {
      // GET USER INFO
      const user = await User.findById(userObjectId)
        .select("name profilePic")
        .lean()
        .exec();
      // GET TASK STATS
      const taskStats = await Task.aggregate([
        // MATCH USER ID AND NOT TRASHED
        {
          $match: {
            userId: userObjectId,
            isTrashed: false,
          },
        },
        // GROUP TO GET COUNTS
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            // COMPLETED TASKS
            completedTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "completed"] },
                      { $gte: ["$completedAt", startDate] },
                      { $lte: ["$completedAt", endDate] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            // IN PROGRESS TASKS
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
            },
            // PENDING TASKS
            pendingTasks: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
          },
        },
      ]).exec();
      // CALCULATE STATS
      const stats = taskStats[0] || {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
      };
      // BUILD REPORT DATA
      reportData = {
        type: "personal",
        user: {
          name: user?.name || "Unknown",
          avatar: user?.profilePic || null,
        },
        summary: stats,
        period: sharedReport.period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      };
      break;
    }
    // PROJECT REPORT
    case "project": {
      // GET PROJECT INFO
      const project = await Project.findById(sharedReport.projectId)
        .select("title description status")
        .lean()
        .exec();
      // IF PROJECT NOT FOUND
      if (!project) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Project not found!",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // GET TASK STATS
      const taskStats = await Task.aggregate([
        // MATCH PROJECT ID AND NOT TRASHED
        {
          $match: {
            projectId: sharedReport.projectId as mongoose.Types.ObjectId,
            isTrashed: false,
          },
        },
        // GROUP TO GET COUNTS
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            // COMPLETED TASKS
            completedTasks: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            // IN PROGRESS TASKS
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
            },
            // PENDING TASKS
            pendingTasks: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
          },
        },
      ]).exec();
      // CALCULATE STATS
      const stats = taskStats[0] || {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
      };
      // BUILD REPORT DATA
      reportData = {
        type: "project",
        project: {
          title: project.title,
          description: project.description,
          status: project.status,
        },
        summary: stats,
        period: sharedReport.period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      };
      break;
    }
    // WORKSPACE REPORT
    case "workspace": {
      // GET WORKSPACE INFO
      const workspace = await Workspace.findById(sharedReport.workspaceId)
        .select("name description visibility")
        .lean()
        .exec();
      // IF WORKSPACE NOT FOUND
      if (!workspace) {
        // RETURNING ERROR RESPONSE
        res.status(404).json({
          message: "Workspace not found!",
          success: false,
        });
        // RETURNING FROM FUNCTION
        return;
      }
      // GET WORKSPACE PROJECTS
      const workspaceProjectDocs = await Project.find({
        workspaceId: sharedReport.workspaceId as mongoose.Types.ObjectId,
        isTrashed: false,
      })
        .select("_id")
        .lean<{ _id: mongoose.Types.ObjectId }[]>()
        .exec();
      // GET PROJECT IDS
      const projectIds = workspaceProjectDocs.map((p) => p._id);
      // GET MEMBERS COUNT
      const memberCount = await WorkspaceMember.countDocuments({
        workspaceId: sharedReport.workspaceId as mongoose.Types.ObjectId,
        status: "active",
      });
      // GET TASK STATS
      const taskStats = await Task.aggregate([
        // MATCH PROJECT IDS AND NOT TRASHED
        {
          $match: {
            projectId: { $in: projectIds },
            isTrashed: false,
          },
        },
        // GROUP TO GET COUNTS
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            // COMPLETED TASKS
            completedTasks: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            // IN PROGRESS TASKS
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
            },
            // PENDING TASKS
            pendingTasks: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
          },
        },
      ]).exec();
      // CALCULATE STATS
      const stats = taskStats[0] || {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        pendingTasks: 0,
      };
      // BUILD REPORT DATA
      reportData = {
        type: "workspace",
        workspace: {
          name: workspace.name,
          description: workspace.description,
          visibility: workspace.visibility,
          memberCount,
          projectCount: projectIds.length,
        },
        summary: stats,
        period: sharedReport.period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
      };
      break;
    }
    default:
      // RETURNING ERROR RESPONSE
      res.status(400).json({
        message: "Invalid report type!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
  }
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    data: reportData,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * REVOKE SHAREABLE LINK
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== REVOKE SHAREABLE LINK ==>
export const revokeShareableLink = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // GETTING SHARE TOKEN FROM REQUEST PARAMS
  const { shareToken } = req.params;
  // FIND AND UPDATE SHARED REPORT DOCUMENT
  const sharedReport = await SharedReport.findOneAndUpdate(
    {
      shareToken,
      userId: new mongoose.Types.ObjectId(String(userId)),
    },
    { isActive: false },
    { new: true }
  );
  // IF SHARED REPORT DOCUMENT NOT FOUND, RETURN 404 ERROR
  if (!sharedReport) {
    // RETURNING ERROR RESPONSE
    res.status(404).json({
      message: "Shared report not found!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    message: "Shareable link revoked successfully!",
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * GET USER'S SHARED REPORTS
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== GET USER'S SHARED REPORTS ==>
export const getUserSharedReports = expressAsyncHandler(async (req, res) => {
  // GETTING USER ID FROM REQUEST
  const userId = (req as unknown as AuthenticatedRequest).id;
  // IF USER ID NOT PROVIDED, RETURN 401 ERROR
  if (!userId) {
    // RETURNING ERROR RESPONSE
    res.status(401).json({
      message: "Unauthorized!",
      success: false,
    });
    // RETURNING FROM FUNCTION
    return;
  }
  // FIND USER'S SHARED REPORT DOCUMENTS
  const sharedReports = await SharedReport.find({
    userId: new mongoose.Types.ObjectId(String(userId)),
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();
  // RETURN SUCCESS RESPONSE
  res.status(200).json({
    success: true,
    data: sharedReports,
  });
  // RETURNING FROM FUNCTION
  return;
});

/**
 * EXPORT PERSONAL REPORT TO PDF
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT PERSONAL REPORT TO PDF ==>
export const exportPersonalReportToPDF = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // GET USER INFO
    const user = await User.findById(userObjectId)
      .select("name email")
      .lean()
      .exec();
    // IF USER NOT FOUND, RETURN 404 ERROR
    if (!user) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "User not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET TASK STATISTICS
    const taskStats = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          // COMPLETED TASKS
          completedTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $gte: ["$completedAt", startDate] },
                    { $lte: ["$completedAt", endDate] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          // IN PROGRESS TASKS
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          // PENDING TASKS
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          // OVERDUE TASKS
          overdueTasks: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "completed"] },
                    { $lt: ["$dueDate", new Date()] },
                    { $ne: ["$dueDate", null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    // PRIORITY DISTRIBUTION
    const priorityDistribution = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED AND COMPLETED AND IN DATE RANGE
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // STATUS DISTRIBUTION
    const statusDistribution = await Task.aggregate([
      // MATCH USER ID AND NOT TRASHED
      {
        $match: {
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // FOCUS SESSION STATS
    const focusStats = await FocusSession.aggregate([
      // MATCH USER ID AND STARTED AT IN DATE RANGE
      {
        $match: {
          userId: userObjectId,
          startedAt: { $gte: startDate, $lte: endDate },
        },
      },
      // GROUP TO GET STATS
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          completedSessions: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          totalDuration: { $sum: "$duration" },
          totalPomodoros: { $sum: "$pomodorosCompleted" },
        },
      },
    ]).exec();
    // TASK STATISTICS
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      overdueTasks: 0,
    };
    // FOCUS SESSION STATISTICS
    const focus = focusStats[0] || {
      totalSessions: 0,
      completedSessions: 0,
      totalDuration: 0,
      totalPomodoros: 0,
    };
    // TOTAL TRACKED TASKS
    const totalTracked =
      stats.completedTasks + stats.inProgressTasks + stats.pendingTasks;
    // COMPLETION RATE
    const completionRate =
      totalTracked > 0
        ? Math.round((stats.completedTasks / totalTracked) * 100)
        : 0;
    // PDF DOCUMENT DEFINITION
    const docDefinition: PdfDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 80, 40, 60],
      header: {
        stack: [
          {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 595,
                h: 4,
                color: "#" + BRAND_COLORS.primary,
              },
            ],
          },
          {
            columns: [
              {
                stack: [
                  {
                    text: "PlanOra",
                    fontSize: 14,
                    bold: true,
                    color: "#" + BRAND_COLORS.primary,
                  },
                  {
                    text: "Personal Productivity Report",
                    fontSize: 9,
                    color: "#" + BRAND_COLORS.lightText,
                  },
                ],
                margin: [40, 12, 0, 0],
              },
              {
                text: new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                fontSize: 9,
                color: "#" + BRAND_COLORS.lightText,
                alignment: "right",
                margin: [0, 18, 40, 0],
              },
            ],
          },
        ],
      },
      footer: (currentPage: number, pageCount: number) => ({
        stack: [
          {
            canvas: [
              {
                type: "line",
                x1: 40,
                y1: 0,
                x2: 555,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#" + BRAND_COLORS.mediumGray,
              },
            ],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            fontSize: 9,
            bold: true,
            color: "#" + BRAND_COLORS.primary,
            alignment: "right",
            margin: [0, 8, 40, 0],
          },
        ],
        margin: [0, 10, 0, 0],
      }),
      content: [
        {
          stack: [
            {
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: 515,
                  h: 90,
                  r: 12,
                  color: "#" + BRAND_COLORS.primaryExtraLight,
                },
              ],
            },
            {
              text: `${user.name || "User"}'s Productivity Report`,
              style: "title",
              relativePosition: { x: 20, y: -72 },
            },
            {
              text: `${getPeriodLabel(
                period
              )} • ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
              style: "subtitle",
              relativePosition: { x: 20, y: -38 },
            },
          ],
          margin: [0, 0, 0, 24],
        },
        { text: "Task Overview", style: "sectionHeader" },
        {
          // COLUMNS
          columns: [
            createPdfStatCard(
              "Total Tasks",
              stats.totalTasks,
              BRAND_COLORS.primary,
              BRAND_COLORS.primaryExtraLight
            ),
            createPdfStatCard(
              "Completed",
              stats.completedTasks,
              BRAND_COLORS.success,
              BRAND_COLORS.successLight
            ),
            createPdfStatCard(
              "In Progress",
              stats.inProgressTasks,
              BRAND_COLORS.info,
              BRAND_COLORS.infoLight
            ),
            createPdfStatCard(
              "Pending",
              stats.pendingTasks,
              BRAND_COLORS.warning,
              BRAND_COLORS.warningLight
            ),
            // OVERDUE TASKS
          ],
          // COLUMN GAP
          columnGap: 8,
          // MARGIN
          margin: [0, 0, 0, 8],
        },
        createPdfProgressBar(
          completionRate,
          "Overall Completion Rate",
          BRAND_COLORS.primary
        ),
        createPdfDistributionChart(
          "Task Status Distribution",
          statusDistribution.map((item) => ({
            label:
              item._id === "to do"
                ? "To Do"
                : item._id === "in progress"
                ? "In Progress"
                : item._id === "completed"
                ? "Completed"
                : (item._id || "Unknown").charAt(0).toUpperCase() +
                  (item._id || "Unknown").slice(1),
            value: item.count,
            color:
              item._id === "completed"
                ? BRAND_COLORS.success
                : item._id === "in progress"
                ? BRAND_COLORS.info
                : BRAND_COLORS.warning,
          }))
        ),
        createPdfDistributionChart(
          "Priority Distribution (Completed)",
          priorityDistribution.map((item) => ({
            label:
              item._id === "high"
                ? "High"
                : item._id === "medium"
                ? "Medium"
                : item._id === "low"
                ? "Low"
                : (item._id || "None").charAt(0).toUpperCase() +
                  (item._id || "None").slice(1),
            value: item.count,
            color:
              item._id === "high"
                ? BRAND_COLORS.danger
                : item._id === "medium"
                ? BRAND_COLORS.warning
                : BRAND_COLORS.success,
          }))
        ),
        { text: "Focus Session Statistics", style: "sectionHeader" },
        {
          columns: [
            createPdfStatCard(
              "Sessions",
              focus.totalSessions,
              BRAND_COLORS.primary,
              BRAND_COLORS.primaryExtraLight
            ),
            createPdfStatCard(
              "Completed",
              focus.completedSessions,
              BRAND_COLORS.success,
              BRAND_COLORS.successLight
            ),
            createPdfStatCard(
              "Focus Time (min)",
              Math.round(focus.totalDuration),
              BRAND_COLORS.info,
              BRAND_COLORS.infoLight
            ),
            createPdfStatCard(
              "Pomodoros",
              focus.totalPomodoros,
              BRAND_COLORS.danger,
              BRAND_COLORS.dangerLight
            ),
          ],
          columnGap: 8,
          margin: [0, 8, 0, 0],
        },
      ],
      styles: pdfStyles,
      defaultStyle: {
        font: "Roboto",
      },
    };
    // CREATE PDF DOCUMENT
    const pdfDoc = pdfPrinter.createPdfKitDocument(toPdfmakeDoc(docDefinition));
    // CHUNKS ARRAY
    const chunks: Buffer[] = [];
    // ON DATA EVENT
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    // ON END EVENT
    pdfDoc.on("end", () => {
      // PDF BUFFER
      const pdfBuffer = Buffer.concat(chunks);
      // SET CONTENT TYPE
      res.setHeader("Content-Type", "application/pdf");
      // SET CONTENT DISPOSITION
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=planora-personal-report-${period}.pdf`
      );
      // SEND PDF BUFFER
      res.send(pdfBuffer);
    });
    // END PDF DOCUMENT
    pdfDoc.end();
    // RETURNING FROM FUNCTION
    return;
  }
);

/**
 * EXPORT PROJECT REPORT TO PDF
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT PROJECT REPORT TO PDF ==>
export const exportProjectReportToPDF = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    // IF USER ID NOT PROVIDED, RETURN 401 ERROR
    if (!userId) {
      // RETURNING ERROR RESPONSE
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GETTING PROJECT ID FROM REQUEST PARAMS
    const { projectId } = req.params;
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // PROJECT OBJECT ID
    const projectObjectId = new mongoose.Types.ObjectId(String(projectId));
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // VERIFY PROJECT OWNERSHIP
    const project = await Project.findOne({
      _id: projectObjectId,
      userId: userObjectId,
      isTrashed: false,
    })
      .lean()
      .exec();
    // IF PROJECT NOT FOUND, RETURN 404 ERROR
    if (!project) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        success: false,
        message: "Project not found!",
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // TASK STATISTICS
    const taskStats = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
        },
      },
    ]).exec();
    // STATUS DISTRIBUTION
    const statusDistribution = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // PRIORITY DISTRIBUTION
    const priorityDistribution = await Task.aggregate([
      // MATCH PROJECT ID AND USER ID AND NOT TRASHED
      {
        $match: {
          projectId: projectObjectId,
          userId: userObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // ALL TASKS
    const allTasks = await Task.find({
      projectId: projectObjectId,
      userId: userObjectId,
      isTrashed: false,
    })
      .select("title status priority dueDate")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<
        { title: string; status: string; priority: string; dueDate?: Date }[]
      >()
      .exec();
    // CALCULATE METRICS
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
    };
    // CALCULATE PROGRESS PERCENTAGE
    const progressPercentage =
      stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;
    // BUILD PDF DOCUMENT
    const docDefinition: PdfDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 80, 40, 60],
      header: {
        stack: [
          {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 595,
                h: 4,
                color: "#" + BRAND_COLORS.info,
              },
            ],
          },
          {
            columns: [
              {
                stack: [
                  {
                    text: "PlanOra",
                    fontSize: 14,
                    bold: true,
                    color: "#" + BRAND_COLORS.primary,
                  },
                  {
                    text: "Project Report",
                    fontSize: 9,
                    color: "#" + BRAND_COLORS.lightText,
                  },
                ],
                margin: [40, 12, 0, 0],
              },
              {
                text: new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                fontSize: 9,
                color: "#" + BRAND_COLORS.lightText,
                alignment: "right",
                margin: [0, 18, 40, 0],
              },
            ],
          },
        ],
      },
      footer: (currentPage: number, pageCount: number) => ({
        stack: [
          {
            canvas: [
              {
                type: "line",
                x1: 40,
                y1: 0,
                x2: 555,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#" + BRAND_COLORS.mediumGray,
              },
            ],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            fontSize: 9,
            bold: true,
            color: "#" + BRAND_COLORS.info,
            alignment: "right",
            margin: [0, 8, 40, 0],
          },
        ],
        margin: [0, 10, 0, 0],
      }),
      content: [
        {
          stack: [
            {
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: 515,
                  h: 95,
                  r: 12,
                  color: "#" + BRAND_COLORS.infoLight,
                },
              ],
            },
            {
              text: project.title,
              style: "title",
              relativePosition: { x: 20, y: -80 },
            },
            {
              text: `${getPeriodLabel(
                period
              )} • ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
              style: "subtitle",
              relativePosition: { x: 20, y: -55 },
            },
            project.description
              ? {
                  text:
                    String(project.description).substring(0, 100) +
                    (String(project.description).length > 100 ? "..." : ""),
                  fontSize: 10,
                  color: "#" + BRAND_COLORS.lightText,
                  relativePosition: { x: 20, y: -35 },
                }
              : {},
          ],
          margin: [0, 0, 0, 24],
        },
        { text: "Project Overview", style: "sectionHeader" },
        {
          columns: [
            createPdfStatCard(
              "Total Tasks",
              stats.totalTasks,
              BRAND_COLORS.primary,
              BRAND_COLORS.primaryExtraLight
            ),
            createPdfStatCard(
              "Completed",
              stats.completedTasks,
              BRAND_COLORS.success,
              BRAND_COLORS.successLight
            ),
            createPdfStatCard(
              "In Progress",
              stats.inProgressTasks,
              BRAND_COLORS.info,
              BRAND_COLORS.infoLight
            ),
            createPdfStatCard(
              "Pending",
              stats.pendingTasks,
              BRAND_COLORS.warning,
              BRAND_COLORS.warningLight
            ),
          ],
          columnGap: 8,
          margin: [0, 0, 0, 8],
        },
        createPdfProgressBar(
          progressPercentage,
          "Project Progress",
          BRAND_COLORS.info
        ),
        createPdfDistributionChart(
          "Task Status Distribution",
          statusDistribution.map((item) => ({
            label:
              item._id === "to do"
                ? "To Do"
                : item._id === "in progress"
                ? "In Progress"
                : item._id === "completed"
                ? "Completed"
                : (item._id || "Unknown").charAt(0).toUpperCase() +
                  (item._id || "Unknown").slice(1),
            value: item.count,
            color:
              item._id === "completed"
                ? BRAND_COLORS.success
                : item._id === "in progress"
                ? BRAND_COLORS.info
                : BRAND_COLORS.warning,
          }))
        ),
        createPdfDistributionChart(
          "Priority Distribution",
          priorityDistribution.map((item) => ({
            label:
              item._id === "high"
                ? "High"
                : item._id === "medium"
                ? "Medium"
                : item._id === "low"
                ? "Low"
                : (item._id || "None").charAt(0).toUpperCase() +
                  (item._id || "None").slice(1),
            value: item.count,
            color:
              item._id === "high"
                ? BRAND_COLORS.danger
                : item._id === "medium"
                ? BRAND_COLORS.warning
                : BRAND_COLORS.success,
          }))
        ),
        { text: "Recent Tasks", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", 70, 60, 80],
            body: [
              [
                { text: "Task", style: "tableHeader" },
                { text: "Status", style: "tableHeader" },
                { text: "Priority", style: "tableHeader" },
                { text: "Due Date", style: "tableHeader" },
              ],
              ...(allTasks.map((task, index) => [
                {
                  text: task.title,
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
                {
                  text: task.status,
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
                {
                  text: task.priority,
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
                {
                  text: task.dueDate
                    ? new Date(task.dueDate).toLocaleDateString()
                    : "N/A",
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
              ]) as unknown as PdfContent[]),
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#" + BRAND_COLORS.mediumGray,
            vLineColor: () => "#" + BRAND_COLORS.mediumGray,
          },
        },
      ],
      styles: pdfStyles,
      defaultStyle: {
        font: "Roboto",
      },
    };
    // GENERATE PDF DOCUMENT
    const pdfDoc = pdfPrinter.createPdfKitDocument(toPdfmakeDoc(docDefinition));
    // CHUNKS ARRAY
    const chunks: Buffer[] = [];
    // ON DATA EVENT
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    // ON END EVENT
    pdfDoc.on("end", () => {
      // PDF BUFFER
      const pdfBuffer = Buffer.concat(chunks);
      // SET CONTENT TYPE
      res.setHeader("Content-Type", "application/pdf");
      // SET CONTENT DISPOSITION
      const sanitizedProjectName = project.title
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase();
      // SET CONTENT DISPOSITION
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=planora-project-${sanitizedProjectName}-${period}.pdf`
      );
      // SEND PDF BUFFER
      res.send(pdfBuffer);
    });
    // END PDF DOCUMENT
    pdfDoc.end();
  }
);

/**
 * EXPORT WORKSPACE REPORT TO PDF
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== EXPORT WORKSPACE REPORT TO PDF ==>
export const exportWorkspaceReportToPDF = expressAsyncHandler(
  async (req, res) => {
    // GETTING USER ID FROM REQUEST
    const userId = (req as unknown as AuthenticatedRequest).id;
    if (!userId) {
      res.status(401).json({
        message: "Unauthorized!",
        success: false,
      });
      return;
    }
    // GETTING WORKSPACE ID FROM REQUEST PARAMS
    const { workspaceId } = req.params;
    // GETTING PERIOD FROM REQUEST QUERY
    const period = (req.query.period as ReportPeriod) || "month";
    // GET DATE RANGE
    const { startDate, endDate } = getDateRange(period);
    // WORKSPACE OBJECT ID
    const workspaceObjectId = new mongoose.Types.ObjectId(String(workspaceId));
    // USER OBJECT ID
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    // VERIFY USER IS A MEMBER
    const membership = await WorkspaceMember.findOne({
      workspaceId: workspaceObjectId,
      userId: userObjectId,
      status: "active",
    })
      .lean()
      .exec();
    // IF USER IS NOT A MEMBER, RETURN 403 ERROR
    if (!membership) {
      // RETURNING ERROR RESPONSE
      res.status(403).json({
        message: "You are not a member of this workspace!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET WORKSPACE DETAILS
    const workspace = await Workspace.findById(workspaceObjectId)
      .select("name description visibility")
      .lean()
      .exec();
    // IF WORKSPACE NOT FOUND, RETURN 404 ERROR
    if (!workspace) {
      // RETURNING ERROR RESPONSE
      res.status(404).json({
        message: "Workspace not found!",
        success: false,
      });
      // RETURNING FROM FUNCTION
      return;
    }
    // GET ALL WORKSPACE MEMBERS
    const members = await WorkspaceMember.find({
      workspaceId: workspaceObjectId,
      status: "active",
    })
      .populate("userId", "name email")
      .lean()
      .exec();
    // GET MEMBER USER IDS
    const memberUserIds: mongoose.Types.ObjectId[] = [];
    // LOOP THROUGH MEMBERS AND GET USER IDS
    for (const member of members) {
      // IF USER ID IS PROVIDED AND IS AN OBJECT
      if (member.userId && typeof member.userId === "object") {
        // CAST TO UNKNOWN FIRST TO AVOID TYPE INCOMPATIBILITY
        const populatedUser = member.userId as unknown as {
          _id: mongoose.Types.ObjectId;
        };
        // IF USER ID IS PROVIDED AND IS AN OBJECT ID
        if (populatedUser._id) {
          // PUSH USER ID TO ARRAY
          memberUserIds.push(
            new mongoose.Types.ObjectId(String(populatedUser._id))
          );
        }
      }
    }
    // GET WORKSPACE PROJECTS
    const workspaceProjectDocs = await Project.find({
      workspaceId: workspaceObjectId,
      isTrashed: false,
    })
      .select("_id title status")
      .lean<{ _id: mongoose.Types.ObjectId; title: string; status: string }[]>()
      .exec();
    // GET PROJECT IDS
    const projectIds = workspaceProjectDocs.map((p) => p._id);
    // TASK STATISTICS
    const taskStats = await Task.aggregate([
      // MATCH PROJECT IDS AND NOT TRASHED
      {
        $match: {
          projectId: { $in: projectIds },
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          // COMPLETED TASKS
          completedTasks: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          // IN PROGRESS TASKS
          inProgressTasks: {
            $sum: { $cond: [{ $eq: ["$status", "in progress"] }, 1, 0] },
          },
          // PENDING TASKS
          pendingTasks: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          // COMPLETED IN PERIOD
          completedInPeriod: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "completed"] },
                    { $gte: ["$completedAt", startDate] },
                    { $lte: ["$completedAt", endDate] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]).exec();
    // GET MEMBER CONTRIBUTIONS
    const memberContributions = await Task.aggregate([
      // MATCH PROJECT IDS AND NOT TRASHED AND COMPLETED AND COMPLETED AT IN PERIOD AND ASSIGNEE ID IN MEMBER USER IDS
      {
        $match: {
          projectId: { $in: projectIds },
          isTrashed: false,
          status: "completed",
          completedAt: { $gte: startDate, $lte: endDate },
          assigneeId: { $in: memberUserIds },
        },
      },
      // LOOKUP ASSIGNEE
      {
        $lookup: {
          from: "users",
          localField: "assigneeId",
          foreignField: "_id",
          as: "assignee",
        },
      },
      // UNWIND ASSIGNEE
      {
        $unwind: {
          path: "$assignee",
          preserveNullAndEmptyArrays: true,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$assigneeId",
          name: { $first: "$assignee.name" },
          tasksCompleted: { $sum: 1 },
        },
      },
      // SORT BY TASKS COMPLETED DESCENDING
      { $sort: { tasksCompleted: -1 } },
      // LIMIT TO 10
      { $limit: 10 },
    ]).exec();
    // PROJECT STATUS DISTRIBUTION
    const projectStatus = await Project.aggregate([
      // MATCH WORKSPACE ID AND NOT TRASHED
      {
        $match: {
          workspaceId: workspaceObjectId,
          isTrashed: false,
        },
      },
      // GROUP TO GET COUNTS
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]).exec();
    // CALCULATE METRICS
    const stats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      completedInPeriod: 0,
    };
    // CALCULATE COMPLETION RATE
    const completionRate =
      stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;
    // BUILD PDF DOCUMENT
    const docDefinition: PdfDocDefinition = {
      pageSize: "A4",
      pageMargins: [40, 80, 40, 60],
      header: {
        stack: [
          {
            canvas: [
              {
                type: "rect",
                x: 0,
                y: 0,
                w: 595,
                h: 4,
                color: "#" + BRAND_COLORS.success,
              },
            ],
          },
          {
            columns: [
              {
                stack: [
                  {
                    text: "PlanOra",
                    fontSize: 14,
                    bold: true,
                    color: "#" + BRAND_COLORS.primary,
                  },
                  {
                    text: "Workspace Report",
                    fontSize: 9,
                    color: "#" + BRAND_COLORS.lightText,
                  },
                ],
                margin: [40, 12, 0, 0],
              },
              {
                text: new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
                fontSize: 9,
                color: "#" + BRAND_COLORS.lightText,
                alignment: "right",
                margin: [0, 18, 40, 0],
              },
            ],
          },
        ],
      },
      footer: (currentPage: number, pageCount: number) => ({
        stack: [
          {
            canvas: [
              {
                type: "line",
                x1: 40,
                y1: 0,
                x2: 555,
                y2: 0,
                lineWidth: 0.5,
                lineColor: "#" + BRAND_COLORS.mediumGray,
              },
            ],
          },
          {
            text: `${currentPage} / ${pageCount}`,
            fontSize: 9,
            bold: true,
            color: "#" + BRAND_COLORS.success,
            alignment: "right",
            margin: [0, 8, 40, 0],
          },
        ],
        margin: [0, 10, 0, 0],
      }),
      content: [
        {
          stack: [
            {
              canvas: [
                {
                  type: "rect",
                  x: 0,
                  y: 0,
                  w: 515,
                  h: 100,
                  r: 12,
                  color: "#" + BRAND_COLORS.successLight,
                },
              ],
            },
            {
              text: workspace.name,
              style: "title",
              relativePosition: { x: 20, y: -85 },
            },
            {
              text: `${getPeriodLabel(
                period
              )} • ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
              style: "subtitle",
              relativePosition: { x: 20, y: -55 },
            },
            {
              columns: [
                {
                  stack: [
                    {
                      canvas: [
                        {
                          type: "rect",
                          x: 0,
                          y: 0,
                          w: 90,
                          h: 24,
                          r: 12,
                          color: "#" + BRAND_COLORS.primary,
                        },
                      ],
                    },
                    {
                      text: `${members.length} Members`,
                      fontSize: 9,
                      bold: true,
                      color: "#" + BRAND_COLORS.white,
                      relativePosition: { x: 14, y: -18 },
                    },
                  ],
                  width: 100,
                },
                {
                  stack: [
                    {
                      canvas: [
                        {
                          type: "rect",
                          x: 0,
                          y: 0,
                          w: 90,
                          h: 24,
                          r: 12,
                          color: "#" + BRAND_COLORS.info,
                        },
                      ],
                    },
                    {
                      text: `${projectIds.length} Projects`,
                      fontSize: 9,
                      bold: true,
                      color: "#" + BRAND_COLORS.white,
                      relativePosition: { x: 14, y: -18 },
                    },
                  ],
                  width: 100,
                },
                {
                  stack: [
                    {
                      canvas: [
                        {
                          type: "rect",
                          x: 0,
                          y: 0,
                          w: 80,
                          h: 24,
                          r: 12,
                          color: "#" + BRAND_COLORS.lightText,
                        },
                      ],
                    },
                    {
                      text: `${workspace.visibility}`,
                      fontSize: 9,
                      bold: true,
                      color: "#" + BRAND_COLORS.white,
                      relativePosition: { x: 16, y: -18 },
                    },
                  ],
                  width: 90,
                },
              ],
              relativePosition: { x: 20, y: -32 },
            },
          ],
          margin: [0, 0, 0, 24],
        },
        { text: "Team Overview", style: "sectionHeader" },
        {
          columns: [
            createPdfStatCard(
              "Total Tasks",
              stats.totalTasks,
              BRAND_COLORS.primary,
              BRAND_COLORS.primaryExtraLight
            ),
            createPdfStatCard(
              "Completed",
              stats.completedTasks,
              BRAND_COLORS.success,
              BRAND_COLORS.successLight
            ),
            createPdfStatCard(
              "In Progress",
              stats.inProgressTasks,
              BRAND_COLORS.info,
              BRAND_COLORS.infoLight
            ),
            createPdfStatCard(
              "Pending",
              stats.pendingTasks,
              BRAND_COLORS.warning,
              BRAND_COLORS.warningLight
            ),
          ],
          columnGap: 8,
          margin: [0, 0, 0, 8],
        },
        createPdfProgressBar(
          completionRate,
          "Team Completion Rate",
          BRAND_COLORS.success
        ),
        createPdfDistributionChart(
          "Project Status Distribution",
          projectStatus.map((item) => ({
            label:
              item._id === "completed"
                ? "Completed"
                : item._id === "in progress"
                ? "In Progress"
                : item._id === "not started"
                ? "Not Started"
                : (item._id || "Unknown").charAt(0).toUpperCase() +
                  (item._id || "Unknown").slice(1),
            value: item.count,
            color:
              item._id === "completed"
                ? BRAND_COLORS.success
                : item._id === "in progress"
                ? BRAND_COLORS.info
                : BRAND_COLORS.warning,
          }))
        ),
        { text: "Top Contributors", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: [30, "*", 100],
            body: [
              [
                { text: "#", style: "tableHeader" },
                { text: "Member", style: "tableHeader" },
                { text: "Tasks Completed", style: "tableHeader" },
              ],
              ...memberContributions.map((member, index) => [
                {
                  text: String(index + 1),
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                  bold: index < 3,
                  alignment: "center",
                },
                {
                  text: member.name || "Unknown",
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
                {
                  text: String(member.tasksCompleted),
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                  bold: true,
                  color:
                    index === 0
                      ? "#" + BRAND_COLORS.success
                      : "#" + BRAND_COLORS.darkText,
                },
              ]),
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#" + BRAND_COLORS.mediumGray,
            vLineColor: () => "#" + BRAND_COLORS.mediumGray,
          },
        },
        { text: "Workspace Projects", style: "sectionHeader" },
        {
          table: {
            headerRows: 1,
            widths: ["*", 100],
            body: [
              [
                { text: "Project", style: "tableHeader" },
                { text: "Status", style: "tableHeader" },
              ],
              ...workspaceProjectDocs.slice(0, 15).map((project, index) => [
                {
                  text: project.title,
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
                {
                  text: project.status,
                  style: "tableCell",
                  fillColor:
                    index % 2 === 0 ? "#FFFFFF" : "#" + BRAND_COLORS.lightGray,
                },
              ]),
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => "#" + BRAND_COLORS.mediumGray,
            vLineColor: () => "#" + BRAND_COLORS.mediumGray,
          },
        },
      ],
      styles: pdfStyles,
      defaultStyle: {
        font: "Roboto",
      },
    };
    // GENERATE PDF DOCUMENT
    const pdfDoc = pdfPrinter.createPdfKitDocument(toPdfmakeDoc(docDefinition));
    // CHUNKS ARRAY
    const chunks: Buffer[] = [];
    // ON DATA
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    // ON END
    pdfDoc.on("end", () => {
      // PDF BUFFER
      const pdfBuffer = Buffer.concat(chunks);
      // SET CONTENT TYPE
      res.setHeader("Content-Type", "application/pdf");
      // SANITIZE WORKSPACE NAME
      const sanitizedWorkspaceName = workspace.name
        .replace(/[^a-z0-9]/gi, "-")
        .toLowerCase();
      // SET CONTENT DISPOSITION
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=planora-workspace-${sanitizedWorkspaceName}-${period}.pdf`
      );
      // SEND PDF BUFFER
      res.send(pdfBuffer);
    });
    // END PDF DOCUMENT
    pdfDoc.end();
  }
);
