import type { Request, Response } from "express";
import { getParam } from "../utils/params.js";
import * as jobCardService from "../services/jobCardService.js";
import { generateJobCardPdf } from "../services/jobCardPdfService.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Get pagination parameters from query string
    // Handle both string and array values (Express can parse query params as arrays)
    const pageParam = Array.isArray(req.query["page"])
      ? req.query["page"][0]
      : req.query["page"];
    const limitParam = Array.isArray(req.query["limit"])
      ? req.query["limit"][0]
      : req.query["limit"];

    let page: number | undefined;
    let limit: number | undefined;

    if (pageParam && typeof pageParam === "string" && pageParam.trim() !== "") {
      const parsedPage = parseInt(pageParam, 10);
      if (!isNaN(parsedPage) && parsedPage > 0) {
        page = parsedPage;
      }
    }

    if (
      limitParam &&
      typeof limitParam === "string" &&
      limitParam.trim() !== ""
    ) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = parsedLimit;
      }
    }

    // Validate pagination parameters
    if (page !== undefined && page < 1) {
      res.status(400).json({ error: "Page must be a positive number" });
      return;
    }

    if (limit !== undefined && (limit < 1 || limit > 100)) {
      res.status(400).json({
        error: "Limit must be a positive number between 1 and 100",
      });
      return;
    }

    const result = await jobCardService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching job cards:", error);
    res.status(500).json({ error: "Failed to fetch job cards" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const jobCard = await jobCardService.findById(id);

    if (!jobCard) {
      res.status(404).json({ error: "Job card not found" });
      return;
    }

    res.json(jobCard);
  } catch (error) {
    console.error("Error fetching job card:", error);
    res.status(500).json({ error: "Failed to fetch job card" });
  }
}

export async function getByJobNumber(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const jobNumber = getParam(req.params["jobNumber"]);
    if (!jobNumber) {
      res.status(400).json({ error: "Job number is required" });
      return;
    }

    const jobCard = await jobCardService.findByJobNumber(jobNumber);

    if (!jobCard) {
      res.status(404).json({ error: "Job card not found" });
      return;
    }

    res.json(jobCard);
  } catch (error) {
    console.error("Error fetching job card:", error);
    res.status(500).json({ error: "Failed to fetch job card" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const jobCard = await jobCardService.create(req.body, req.employee?.id);
    res.status(201).json(jobCard);
  } catch (error) {
    console.error("Error creating job card:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create job card";
    res.status(400).json({ error: errorMessage });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    // STAFF role cannot update job card status - remove status from update data
    const updateData = { ...req.body };
    if (req.employee?.roleName === "STAFF" && updateData.status !== undefined) {
      delete updateData.status;
    }

    const jobCard = await jobCardService.update(
      id,
      updateData,
      req.employee?.id
    );
    res.json(jobCard);
  } catch (error) {
    console.error("Error updating job card:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update job card";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteJobCard(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const jobCard = await jobCardService.deleteJobCard(id, req.employee?.id);
    res.json(jobCard);
  } catch (error) {
    console.error("Error deleting job card:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete job card";
    res.status(400).json({ error: errorMessage });
  }
}

// JobTask controllers
export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const jobCardId = getParam(req.params["jobCardId"]);
    if (!jobCardId) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const task = await jobCardService.createTask(
      { ...req.body, jobCardId },
      req.employee?.id
    );
    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create task";
    res.status(400).json({ error: errorMessage });
  }
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Task ID is required" });
      return;
    }

    const task = await jobCardService.updateTask(
      id,
      req.body,
      req.employee?.id
    );
    res.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update task";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Task ID is required" });
      return;
    }

    const task = await jobCardService.deleteTask(id, req.employee?.id);
    res.json(task);
  } catch (error) {
    console.error("Error deleting task:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete task";
    res.status(400).json({ error: errorMessage });
  }
}

// JobExpense controllers
export async function createExpense(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const jobCardId = getParam(req.params["jobCardId"]);
    if (!jobCardId) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const expense = await jobCardService.createExpense(
      { ...req.body, jobCardId },
      req.employee?.id
    );
    res.status(201).json(expense);
  } catch (error) {
    console.error("Error creating expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create expense";
    res.status(400).json({ error: errorMessage });
  }
}

export async function updateExpense(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await jobCardService.updateExpense(
      id,
      req.body,
      req.employee?.id
    );
    res.json(expense);
  } catch (error) {
    console.error("Error updating expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update expense";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteExpense(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Expense ID is required" });
      return;
    }

    const expense = await jobCardService.deleteExpense(id, req.employee?.id);
    res.json(expense);
  } catch (error) {
    console.error("Error deleting expense:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete expense";
    res.status(400).json({ error: errorMessage });
  }
}

// JobCardApproval controllers
export async function createApproval(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const jobCardId = getParam(req.params["jobCardId"]);
    if (!jobCardId) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const approval = await jobCardService.createApproval(
      { ...req.body, jobCardId },
      req.employee?.id
    );
    res.status(201).json(approval);
  } catch (error) {
    console.error("Error creating approval:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create approval";
    res.status(400).json({ error: errorMessage });
  }
}

export async function updateApproval(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Approval ID is required" });
      return;
    }

    const approval = await jobCardService.updateApproval(
      id,
      req.body,
      req.employee?.id
    );
    res.json(approval);
  } catch (error) {
    console.error("Error updating approval:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update approval";
    res.status(400).json({ error: errorMessage });
  }
}

export async function deleteApproval(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Approval ID is required" });
      return;
    }

    const approval = await jobCardService.deleteApproval(id, req.employee?.id);
    res.json(approval);
  } catch (error) {
    console.error("Error deleting approval:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to delete approval";
    res.status(400).json({ error: errorMessage });
  }
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);

    if (!id) {
      res.status(400).json({ error: "Job card ID is required" });
      return;
    }

    const pdfBuffer = await generateJobCardPdf(id);

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="job-card-${id}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length.toString());

    // Send the PDF buffer
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate PDF";
    res.status(400).json({ error: errorMessage });
  }
}
