import { NextResponse } from "next/server";
import { studentsToWorkbook } from "@/lib/excel";

export async function GET() {
  const buf = studentsToWorkbook();
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="tusgu-students-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
