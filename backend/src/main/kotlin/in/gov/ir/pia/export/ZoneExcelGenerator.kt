package `in`.gov.ir.pia.export

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

/**
 * Generates a zone-scope .xlsx workbook.
 *
 * Sheet 1 — "Summary": zone KPIs and generation metadata.
 * Sheet 2 — "Projects": all non-deleted projects in the zone with key columns.
 *
 * Used by the asynchronous POST /api/v1/export/zone/{zoneId} path.
 */
@Component
class ZoneExcelGenerator(
    private val jdbc: JdbcTemplate,
) {
    private val tsFormatter = DateTimeFormatter
        .ofPattern("yyyy-MM-dd HH:mm:ss z")
        .withZone(ZoneId.of("Asia/Kolkata"))

    fun generate(zoneId: UUID): ByteArray {
        val wb = ExcelWorkbookBuilder.create()

        writeSummarySheet(wb, zoneId)
        writeProjectsSheet(wb, zoneId)

        return ExcelWorkbookBuilder.toBytes(wb)
    }

    private fun writeSummarySheet(
        wb: org.apache.poi.xssf.usermodel.XSSFWorkbook,
        zoneId: UUID,
    ) {
        val sheet = ExcelWorkbookBuilder.addSheet(wb, "Summary")

        val zone = jdbc.queryForMap("SELECT code, name FROM zones WHERE id = ?", zoneId)
        val projectCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM projects WHERE zone_id = ? AND NOT is_deleted",
            Long::class.java, zoneId,
        ) ?: 0L

        // Load zone summary KPIs (default 0 if no workflow events yet)
        val kpis = jdbc.queryForList(
            """
            SELECT projects_active, projects_with_sla_breaches, total_drawings_in_approval
            FROM zone_summary WHERE zone_id = ?
            """.trimIndent(),
            zoneId,
        ).firstOrNull()

        val metaRows = listOf(
            listOf("Field", "Value"),
            listOf("Zone Code", zone["code"]),
            listOf("Zone Name", zone["name"]),
            listOf("Total Projects", projectCount),
            listOf("Projects Active", kpis?.get("projects_active") ?: 0),
            listOf("SLA Breaches", kpis?.get("projects_with_sla_breaches") ?: 0),
            listOf("Drawings In Approval", kpis?.get("total_drawings_in_approval") ?: 0),
            listOf("Generated At", tsFormatter.format(Instant.now())),
        )

        metaRows.forEachIndexed { rowIdx, row ->
            val sheetRow = sheet.createRow(rowIdx)
            row.forEachIndexed { col, cell ->
                sheetRow.createCell(col).setCellValue(cell?.toString() ?: "")
            }
        }

        ExcelWorkbookBuilder.autoSizeColumns(sheet, 2)
    }

    private fun writeProjectsSheet(
        wb: org.apache.poi.xssf.usermodel.XSSFWorkbook,
        zoneId: UUID,
    ) {
        val headers = listOf(
            "Project ID", "Project Code", "Name", "Lifecycle State",
            "Division", "Days Since RB", "SLA Breaches", "Drawings In Approval",
        )
        val sheet = ExcelWorkbookBuilder.addSheet(wb, "Projects")
        ExcelWorkbookBuilder.writeHeaderRow(wb, sheet, headers)

        val today = java.time.LocalDate.now()
        val projects = jdbc.queryForList(
            """
            SELECT p.id, p.project_code, p.name, p.lifecycle_state,
                   d.name AS division_name,
                   p.recommended_by_board_on,
                   COALESCE(ps.sla_breach_count, 0)    AS sla_breach_count,
                   COALESCE(ps.drawings_in_approval, 0) AS drawings_in_approval
            FROM projects p
            LEFT JOIN divisions d ON d.id = p.division_id
            LEFT JOIN project_summary ps ON ps.project_id = p.id
            WHERE p.zone_id = ? AND NOT p.is_deleted
            ORDER BY p.name
            """.trimIndent(),
            zoneId,
        )

        projects.forEachIndexed { i, row ->
            val rbDate = (row["recommended_by_board_on"] as? java.sql.Date)?.toLocalDate()
            val daysSinceRb = rbDate?.let { java.time.temporal.ChronoUnit.DAYS.between(it, today) }
            ExcelWorkbookBuilder.writeDataRow(sheet, i + 1, listOf(
                row["id"]?.toString(),
                row["project_code"] ?: "-",
                row["name"],
                row["lifecycle_state"],
                row["division_name"] ?: "-",
                daysSinceRb,
                row["sla_breach_count"],
                row["drawings_in_approval"],
            ))
        }

        ExcelWorkbookBuilder.autoSizeColumns(sheet, headers.size)
    }
}
