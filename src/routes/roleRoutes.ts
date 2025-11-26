import { Router } from "express";
import * as roleController from "../controllers/roleController.js";

const router = Router();

router.get("/", roleController.getAll);
router.get("/:id", roleController.getById);

export default router;
