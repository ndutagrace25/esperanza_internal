import { Router } from "express";
import * as jobCardController from "../controllers/jobCardController.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// All authenticated users can view job cards
router.get("/", jobCardController.getAll);

// All authenticated users can view a specific job card by job number
// This must come before /:id to avoid route conflicts
router.get("/job-number/:jobNumber", jobCardController.getByJobNumber);

// All authenticated users can download PDF for a job card
// This must come before /:id to avoid route conflicts
router.get("/:id/pdf", jobCardController.downloadPdf);

// All authenticated users can view a specific job card by ID
router.get("/:id", jobCardController.getById);

// all role can create job cards
router.post("/", jobCardController.create);

// Only DIRECTOR role can update job cards
router.patch("/:id", authorize("DIRECTOR"), jobCardController.update);

// Only DIRECTOR role can delete job cards
router.delete("/:id", authorize("DIRECTOR"), jobCardController.deleteJobCard);

// Nested routes for tasks
// STAFF and DIRECTOR can create tasks
router.post(
  "/:jobCardId/tasks",
  authorize(["DIRECTOR", "STAFF"]),
  jobCardController.createTask
);
// STAFF and DIRECTOR can update tasks
router.patch(
  "/tasks/:id",
  authorize(["DIRECTOR", "STAFF"]),
  jobCardController.updateTask
);
// Only DIRECTOR can delete tasks
router.delete(
  "/tasks/:id",
  authorize("DIRECTOR"),
  jobCardController.deleteTask
);

// Nested routes for expenses
// STAFF and DIRECTOR can create expenses
router.post(
  "/:jobCardId/expenses",
  authorize(["DIRECTOR", "STAFF"]),
  jobCardController.createExpense
);
// STAFF and DIRECTOR can update expenses
router.patch(
  "/expenses/:id",
  authorize(["DIRECTOR", "STAFF"]),
  jobCardController.updateExpense
);
// Only DIRECTOR can delete expenses
router.delete(
  "/expenses/:id",
  authorize("DIRECTOR"),
  jobCardController.deleteExpense
);

// Nested routes for approvals
router.post(
  "/:jobCardId/approvals",
  authorize("DIRECTOR"),
  jobCardController.createApproval
);
router.patch(
  "/approvals/:id",
  authorize("DIRECTOR"),
  jobCardController.updateApproval
);
router.delete(
  "/approvals/:id",
  authorize("DIRECTOR"),
  jobCardController.deleteApproval
);

export default router;
