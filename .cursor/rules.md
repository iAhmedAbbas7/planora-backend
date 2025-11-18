# PlanOra Backend Code Style and Best Practices

## Code Pattern and Style

### File Naming Convention
- **Models**: `*.model.ts` (e.g., `user.model.ts`, `project.model.ts`)
- **Controllers**: `*.controller.ts` (e.g., `auth.controller.ts`, `project.controller.ts`)
- **Routes**: `*.route.ts` (e.g., `auth.route.ts`, `project.route.ts`)
- **Middleware**: `*.ts` with descriptive names (e.g., `isAuthenticated.ts`, `errorHandler.ts`)

### Code Structure Pattern

#### Routes Pattern
```typescript
// <== IMPORTS ==>
import express from "express";
import isAuthenticated from "../middleware/isAuthenticated.js";
import { controllerFunction1, controllerFunction2 } from "../controllers/example.controller.js";

// <== ROUTER ==>
const router = express.Router();

// <== ROUTES ==>
// ALL ROUTES REQUIRE AUTHENTICATION
router.use(isAuthenticated);
// GET ROUTE
router.get("/", controllerFunction1);
// POST ROUTE
router.post("/", controllerFunction2);

export default router;
```

**IMPORTANT**: Never write inline async handlers in route files. All route handlers must be extracted to controller files and use `express-async-handler`.

#### Controllers Pattern
```typescript
// <== IMPORTS ==>
import { Model } from "../models/example.model.js";
import expressAsyncHandler from "express-async-handler";

/**
 * FUNCTION DESCRIPTION
 * @param req - Request Object
 * @param res - Response Object
 * @returns Response Object
 */
// <== FUNCTION NAME ==>
export const functionName = expressAsyncHandler(async (req, res) => {
  // GETTING DATA FROM REQUEST
  const { field1, field2 } = req.body;
  // VALIDATION LOGIC
  if (!field1) {
    res.status(400).json({
      message: "Field1 is Required!",
      success: false,
    });
    return;
  }
  // BUSINESS LOGIC
  const result = await Model.create({ field1, field2 });
  // RETURNING RESPONSE
  res.status(201).json({
    message: "Success Message!",
    success: true,
    data: result,
  });
  return;
});
```

#### Models Pattern
```typescript
// <== IMPORTS ==>
import mongoose from "mongoose";

// <== MODEL SCHEMA ==>
const modelSchema = new mongoose.Schema(
  {
    field1: {
      type: String,
      required: true,
      trim: true,
      index: true, // Add indexes for frequently queried fields
    },
    field2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RelatedModel",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// <== INDEXES ==>
modelSchema.index({ field1: 1, field2: -1 }); // Compound index if needed

// <== EXPORTING THE MODEL ==>
export const Model = mongoose.model("Model", modelSchema);
```

## Best Practices

### 1. Error Handling
- Always use `express-async-handler` for async route handlers
- Return early with proper status codes and messages
- Use consistent error response format: `{ message: string, success: boolean }`
- Always include `return;` after sending response

### 2. Validation
- Validate all required fields before processing
- Use Mongoose schema validation
- Add custom validation where needed
- Return 400 status for validation errors

### 3. Database Operations
- Use `.lean()` for read-only operations when possible
- Use `.exec()` for better error handling
- Add indexes to frequently queried fields
- Use transactions for multi-document operations
- Implement proper pagination for list endpoints

### 4. Security
- Always use authentication middleware (`isAuthenticated`) for protected routes
- Never expose sensitive data in responses
- Hash passwords using bcryptjs
- Use environment variables for secrets
- Validate and sanitize all user inputs

### 5. Response Format
- Success responses: `{ success: true, message?: string, data?: any }`
- Error responses: `{ success: false, message: string }`
- Include pagination metadata for list endpoints: `{ count, total, page, totalPages, data }`

### 6. TypeScript
- Use proper types for all function parameters and return values
- Use interfaces for complex objects
- Avoid `any` type, use `unknown` if necessary
- Use JSDoc comments for complex functions

### 7. Code Comments
- Use `// <== SECTION NAME ==>` for major sections
- Add inline comments for complex logic
- Document function parameters and return values
- Keep comments concise and meaningful

### 8. File Organization
- Group related functionality together
- Keep controllers focused on business logic
- Keep routes focused on routing
- Keep models focused on data structure
- **NEVER** write inline route handlers in route files - always extract to controller
- All route handlers must use `express-async-handler` and be defined in controller files

### 9. Performance
- Add database indexes for frequently queried fields
- Use aggregation pipelines for complex queries
- Implement pagination for large datasets
- Use `.select()` to limit returned fields
- Use `.populate()` efficiently

### 10. Code Quality
- Follow single responsibility principle
- Keep functions small and focused
- Use meaningful variable names
- Avoid code duplication
- Write self-documenting code

## Migration Guidelines

1. **Models First**: Create all models with proper schemas, indexes, and validation
2. **Controllers Second**: Implement controllers with proper error handling
3. **Routes Last**: Wire up routes with proper middleware
4. **Optimize**: Add indexes, validation, and error handling improvements
5. **Test**: Ensure all endpoints work correctly

## File Editing Guidelines

### Code Expansion and Collapsing
- **NEVER** expand collapsed code sections when reading files
- If you must expand code to make edits, **ALWAYS collapse it back** after completing changes
- Respect the user's file organization and collapsed state
- Only expand what is absolutely necessary for the specific change being made
- Collapse all code sections after making edits to maintain file organization

## Notes

- Always use `.js` extension in imports (ES modules)
- Use `express-async-handler` for all async route handlers
- Follow the exact comment pattern shown in examples
- Maintain consistency across all files
- Optimize beyond template code with best practices

