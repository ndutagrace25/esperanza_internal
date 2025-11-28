import PDFDocument from "pdfkit";
import { Buffer } from "buffer";
import { prisma } from "../lib/prisma.js";

/**
 * Format date to "DD MMM YYYY" format
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Generate PDF for a job card
 */
export async function generateJobCardPdf(jobCardId: string): Promise<Buffer> {
  // Fetch job card with all relations
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
          address: true,
        },
      },
      supportStaff: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      tasks: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          moduleName: true,
          taskType: true,
          description: true,
          startTime: true,
          endTime: true,
        },
      },
      expenses: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          category: true,
          description: true,
          amount: true,
          hasReceipt: true,
        },
      },
      approvals: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          approverName: true,
          approverTitle: true,
          comment: true,
          signedAt: true,
          signatureType: true,
        },
      },
    },
  });

  if (!jobCard) {
    throw new Error("Job card not found");
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 50, right: 50 },
  });

  const buffers: Buffer[] = [];

  // Set up promise to collect PDF buffer
  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      buffers.push(chunk);
    });
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    doc.on("error", reject);
  });

  // Professional Header with border
  const headerY = 40;
  doc.rect(50, headerY, 495, 50).stroke();
  doc.fontSize(24).font("Helvetica-Bold").fillColor("#1a1a1a");
  doc.text("ESPERANZA JOB CARD", 50, headerY + 15, {
    align: "center",
    width: 495,
  });
  doc.fillColor("black");
  doc.y = headerY + 50;
  doc.moveDown(1);

  // Side by side: Company Information (left) and Visit Information (right)
  const sectionsY = doc.y;
  const sectionWidth = 240; // Width for each section
  const sectionHeight = 130; // Height for both sections
  const gap = 15; // Gap between sections

  // Company Information Section (left) with border
  doc.rect(50, sectionsY, sectionWidth, sectionHeight).stroke();
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#333333");
  doc.text("Company Information", 60, sectionsY + 10);
  doc.fillColor("black");
  doc.fontSize(10).font("Helvetica");

  const companyInfo = [
    ["Company Name:", "Esperanza Digital Solution"],
    ["Phone:", "+254708807403"],
    ["Email:", "venturabsltd@gmail.com"],
    ["Address:", "Nairobi, Kenya"],
  ];

  let currentY = sectionsY + 30;
  const baseLineHeight = 12; // Base line height for single line
  const lineSpacing = 4; // Additional spacing between lines

  companyInfo.forEach(([label, value]) => {
    const itemY = currentY;
    doc.font("Helvetica");

    // Calculate if label text will wrap
    const labelText = label || "";
    const labelHeight = doc.heightOfString(labelText, { width: 100 });

    doc.text(labelText, 60, itemY, { width: 100 });
    doc.font("Helvetica-Bold");

    // Calculate if value text will wrap
    const valueText = value || "";
    const valueHeight = doc.heightOfString(valueText, { width: 120 });

    doc.text(valueText, 160, itemY, { width: 120 });

    // Use the maximum height of label or value to determine spacing
    const maxHeight = Math.max(labelHeight, valueHeight);
    const wrapped = maxHeight > baseLineHeight;

    // Move to next item position - add extra spacing if current item wrapped
    if (wrapped) {
      currentY += maxHeight + lineSpacing + 4; // Extra spacing when wrapped
    } else {
      currentY += 20; // Normal spacing
    }
  });

  // Visit Information Section (right) with border
  const visitX = 50 + sectionWidth + gap;
  doc.rect(visitX, sectionsY, sectionWidth, sectionHeight).stroke();
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#333333");
  doc.text("Visit Information", visitX + 10, sectionsY + 10);
  doc.fillColor("black");

  const visitInfo = [
    ["Job Card No:", jobCard.jobNumber],
    ["Date:", formatDate(jobCard.visitDate.toString())],
    ["Client Name:", jobCard.client.companyName],
    ["Location:", jobCard.location || jobCard.client.address || "—"],
    ["Contact Person:", jobCard.contactPerson || "—"],
    ["Purpose:", jobCard.purpose || "—"],
  ];

  let visitCurrentY = sectionsY + 30;
  const visitBaseLineHeight = 12;
  const visitLineSpacing = 4;

  visitInfo.forEach(([label, value]) => {
    const itemY = visitCurrentY;
    doc.fontSize(10).font("Helvetica");

    // Calculate if label text will wrap
    const labelText = label || "";
    const labelHeight = doc.heightOfString(labelText, { width: 100 });

    doc.text(labelText, visitX + 10, itemY, { width: 100 });
    doc.font("Helvetica-Bold");

    // Calculate if value text will wrap
    const valueText = value || "—";
    const valueHeight = doc.heightOfString(valueText, { width: 120 });

    doc.text(valueText, visitX + 110, itemY, { width: 120 });

    // Use the maximum height of label or value to determine spacing
    const maxHeight = Math.max(labelHeight, valueHeight);
    const wrapped = maxHeight > visitBaseLineHeight;

    // Move to next item position - add extra spacing if current item wrapped
    if (wrapped) {
      visitCurrentY += maxHeight + visitLineSpacing + 4; // Extra spacing when wrapped
    } else {
      visitCurrentY += 16; // Normal spacing
    }
  });

  doc.y = sectionsY + sectionHeight;
  doc.moveDown(1);

  // Section B: Tasks Completed with border
  const tasksY = doc.y;
  const tasksHeight = 150;
  doc.rect(50, tasksY, 495, tasksHeight).stroke();
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#333333");
  doc.text("Tasks Completed", 60, tasksY + 10);
  doc.fillColor("black");

  let currentTaskY = tasksY + 30;

  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Work Done:", 60, currentTaskY);
  currentTaskY += 18;

  if (jobCard.tasks.length > 0) {
    jobCard.tasks.forEach((task) => {
      const taskText = task.description || task.moduleName || "—";
      doc.fontSize(10).font("Helvetica");
      doc.text(`• ${taskText}`, 70, currentTaskY, { width: 470 });
      currentTaskY += 16;
    });
  } else if (jobCard.workSummary) {
    // If no tasks but has work summary, use that
    const summaryLines = jobCard.workSummary.split("\n");
    summaryLines.forEach((line) => {
      if (line.trim()) {
        doc.fontSize(10).font("Helvetica");
        doc.text(`• ${line.trim()}`, 70, currentTaskY, { width: 470 });
        currentTaskY += 16;
      }
    });
  } else {
    doc.fontSize(10).font("Helvetica");
    doc.text("No tasks recorded.", 70, currentTaskY);
    currentTaskY += 16;
  }

  doc.y = tasksY + tasksHeight;
  doc.moveDown(1);

  // Section C: Client Confirmation with border
  const clientY = doc.y;
  const clientHeight = 80;
  doc.rect(50, clientY, 495, clientHeight).stroke();
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#333333");
  doc.text("Client Confirmation", 60, clientY + 10);
  doc.fillColor("black");

  const clientApproval = jobCard.approvals.find((a) => a.role === "CLIENT");

  doc.fontSize(10).font("Helvetica");
  doc.text(
    `Client Name: ${
      clientApproval?.approverName || jobCard.contactPerson || "—"
    }`,
    60,
    clientY + 35
  );
  doc.text("Signature: ", 60, clientY + 55);
  doc.text("Stamp: ", 60, clientY + 70);

  doc.y = clientY + clientHeight;
  doc.moveDown(1);

  // Section D: Internal Approval with border
  const approvalY = doc.y;
  const approvalHeight = 80;
  doc.rect(50, approvalY, 495, approvalHeight).stroke();
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#333333");
  doc.text("Internal Approval", 60, approvalY + 10);
  doc.fillColor("black");

  doc.fontSize(10).font("Helvetica");
  doc.text(
    `Support Staff: ${
      jobCard.supportStaff
        ? `${jobCard.supportStaff.firstName} ${jobCard.supportStaff.lastName}`
        : "—"
    }`,
    60,
    approvalY + 35
  );

  // Supervisor and Finance approvals would be DIRECTOR role in the current schema
  const directorApproval = jobCard.approvals.find((a) => a.role === "DIRECTOR");
  doc.text(
    `Supervisor: ${directorApproval?.approverName || "—"}`,
    60,
    approvalY + 55
  );
  doc.text(
    `Finance Approval: ${directorApproval?.approverName || "—"}`,
    60,
    approvalY + 70
  );

  doc.end();

  return pdfPromise;
}
