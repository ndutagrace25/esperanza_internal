import type { Request, Response } from "express";
import * as employeeService from "../services/employeeService.js";

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    // Get pagination parameters from query string
    const page = req.query["page"]
      ? parseInt(req.query["page"] as string, 10)
      : undefined;
    const limit = req.query["limit"]
      ? parseInt(req.query["limit"] as string, 10)
      : undefined;

    // Validate pagination parameters
    if (page !== undefined && (isNaN(page) || page < 1)) {
      res.status(400).json({ error: "Page must be a positive number" });
      return;
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
      res.status(400).json({
        error: "Limit must be a positive number between 1 and 100",
      });
      return;
    }

    const result = await employeeService.findAll({
      ...(page !== undefined && { page }),
      ...(limit !== undefined && { limit }),
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Employee ID is required" });
      return;
    }

    const employee = await employeeService.findById(id);

    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const employee = await employeeService.create(req.body, req.employee?.id);
    res.status(201).json(employee);
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(400).json({ error: "Failed to create employee" });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Employee ID is required" });
      return;
    }

    const employee = await employeeService.update(
      id,
      req.body,
      req.employee?.id
    );
    res.json(employee);
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(400).json({ error: "Failed to update employee" });
  }
}

export async function deleteEmployee(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Employee ID is required" });
      return;
    }

    await employeeService.deleteEmployee(id, req.employee?.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(400).json({ error: "Failed to delete employee" });
  }
}
