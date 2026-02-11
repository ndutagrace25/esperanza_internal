import type { Request, Response } from "express";
import * as roleService from "../services/roleService.js";
import { getParam } from "../utils/params.js";

export async function getAll(_req: Request, res: Response): Promise<void> {
  try {
    const roles = await roleService.findAll();
    res.json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = getParam(req.params["id"]);
    if (!id) {
      res.status(400).json({ error: "Role ID is required" });
      return;
    }

    const role = await roleService.findById(id);

    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    res.json(role);
  } catch (error) {
    console.error("Error fetching role:", error);
    res.status(500).json({ error: "Failed to fetch role" });
  }
}
