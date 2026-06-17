package `in`.gov.ir.pia.export

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * Generates a project-scope .xlsx workbook.
 *
 * Sheet 1 — "Summary": project KPIs (name, zone, lifecycle state, record counts
 *   per activity type) and generation timestamp.
 * Sheet 2 — "Activity Records": flat list of all activity records across all
 *   activities of the project.
 *
 * Used by the synchronous GET /api/v1/export/projects/{projectId} path.
 */
@Component
class ProjectExcelGenerator(
    private val jdbc: JdbcTemplate,
) {
    private val tsFormatter =
        DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss z")
            .withZone(ZoneId.of("Asia/Kolkata"))

    fun generate(projectId: UUID): ByteArray {
        val wb = ExcelWorkbookBuilder.create()

        writeSummarySheet(wb, projectId)
        writeActivityRecordsSheet(wb, projectId)

        return ExcelWorkbookBuilder.toBytes(wb)
    }

    private fun writeSummarySheet(
        wb: org.apache.poi.xssf.usermodel.XSSFWorkbook,
        projectId: UUID,
    ) {
        val sheet = ExcelWorkbookBuilder.addSheet(wb, "Summary")

        // Load project metadata
        val project =
            jdbc.queryForMap(
                """
                SELECT p.name, p.lifecycle_state, p.project_code, z.code AS zone_code
                FROM projects p
                LEFT JOIN zones z ON z.id = p.zone_id
                WHERE p.id = ?
                """.trimIndent(),
                projectId,
            )

        val metaRows =
            listOf(
                listOf("Field", "Value"),
                listOf("Project Name", project["name"]),
                listOf("Project Code", project["project_code"] ?: "-"),
                listOf("Zone", project["zone_code"] ?: "-"),
                listOf("Lifecycle State", project["lifecycle_state"]),
                listOf("Generated At", tsFormatter.format(Instant.now())),
            )

        // Write key-value style (no frozen header for summary)
        metaRows.forEachIndexed { rowIdx, row ->
            val sheetRow = sheet.createRow(rowIdx)
            row.forEachIndexed { col, cell ->
                sheetRow.createCell(col).setCellValue(cell?.toString() ?: "")
            }
        }

        // Activity type counts from project_activity_summary
        val activitySummaries =
            jdbc.queryForList(
                """
                SELECT activity_type_code, total_records, authenticated_count, sent_back_count
                FROM project_activity_summary
                WHERE project_id = ?
                ORDER BY activity_type_code
                """.trimIndent(),
                projectId,
            )

        val headerRow = sheet.createRow(metaRows.size + 1)
        listOf("Activity Type", "Total Records", "Authenticated", "Sent Back").forEachIndexed { col, h ->
            headerRow.createCell(col).setCellValue(h)
        }

        activitySummaries.forEachIndexed { i, row ->
            ExcelWorkbookBuilder.writeDataRow(
                sheet,
                metaRows.size + 2 + i,
                listOf(
                    row["activity_type_code"],
                    row["total_records"],
                    row["authenticated_count"],
                    row["sent_back_count"],
                ),
            )
        }

        ExcelWorkbookBuilder.autoSizeColumns(sheet, 4)
    }

    private fun writeActivityRecordsSheet(
        wb: org.apache.poi.xssf.usermodel.XSSFWorkbook,
        projectId: UUID,
    ) {
        val headers = listOf("Record ID", "Activity Type", "Record Subtype", "State", "Created At")
        val sheet = ExcelWorkbookBuilder.addSheet(wb, "Activity Records")
        ExcelWorkbookBuilder.writeHeaderRow(wb, sheet, headers)

        val records =
            jdbc.queryForList(
                """
                SELECT ar.id, pa.activity_type_code, ar.record_subtype,
                       ar.record_state, ar.created_at
                FROM activity_records ar
                JOIN project_activities pa ON ar.project_activity_id = pa.id
                WHERE pa.project_id = ?
                  AND NOT ar.is_deleted
                ORDER BY ar.created_at DESC
                """.trimIndent(),
                projectId,
            )

        records.forEachIndexed { i, row ->
            val createdAt =
                (row["created_at"] as? java.sql.Timestamp)
                    ?.toInstant()
                    ?.atZone(ZoneId.of("Asia/Kolkata"))
                    ?.toLocalDate()
            ExcelWorkbookBuilder.writeDataRow(
                sheet,
                i + 1,
                listOf(
                    row["id"]?.toString(),
                    row["activity_type_code"],
                    row["record_subtype"] ?: "-",
                    row["record_state"],
                    createdAt,
                ),
            )
        }

        ExcelWorkbookBuilder.autoSizeColumns(sheet, headers.size)
    }
}
