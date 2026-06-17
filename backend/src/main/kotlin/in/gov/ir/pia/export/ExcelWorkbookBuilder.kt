package `in`.gov.ir.pia.export

import org.apache.poi.ss.usermodel.BorderStyle
import org.apache.poi.ss.usermodel.FillPatternType
import org.apache.poi.ss.usermodel.HorizontalAlignment
import org.apache.poi.ss.usermodel.IndexedColors
import org.apache.poi.xssf.usermodel.XSSFSheet
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Thin POI helper used by export generators.
 *
 * Convention (from dashboards.md § 13):
 *   - Frozen header row on every data sheet
 *   - Column headers in bold, light-blue background
 *   - Auto-sized columns after all rows are written
 *   - Dates as YYYY-MM-DD text; no cell colour coding
 *   - First sheet always named "Summary"
 */
object ExcelWorkbookBuilder {
    private val DATE_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    /** Returns a new XSSFWorkbook with a "Summary" sheet pre-created as sheet 0. */
    fun create(): XSSFWorkbook = XSSFWorkbook()

    /** Adds a new sheet and returns it. */
    fun addSheet(
        wb: XSSFWorkbook,
        name: String,
    ): XSSFSheet = wb.createSheet(name)

    /**
     * Writes a bold, blue-tinted header row at row index 0 and freezes it.
     * Call before adding data rows.
     */
    fun writeHeaderRow(
        wb: XSSFWorkbook,
        sheet: XSSFSheet,
        headers: List<String>,
    ) {
        val headerStyle =
            wb.createCellStyle().apply {
                val font = wb.createFont()
                font.bold = true
                setFont(font)
                fillForegroundColor = IndexedColors.PALE_BLUE.index
                fillPattern = FillPatternType.SOLID_FOREGROUND
                alignment = HorizontalAlignment.LEFT
                setBorderBottom(BorderStyle.THIN)
            }
        val row = sheet.createRow(0)
        headers.forEachIndexed { col, header ->
            row.createCell(col).apply {
                setCellValue(header)
                cellStyle = headerStyle
            }
        }
        sheet.createFreezePane(0, 1) // freeze header row
    }

    /**
     * Appends a data row at [rowIndex] (1-based when header is at 0).
     * Null values produce a blank cell; [LocalDate] is formatted as YYYY-MM-DD;
     * numbers and strings are written directly.
     */
    fun writeDataRow(
        sheet: XSSFSheet,
        rowIndex: Int,
        values: List<Any?>,
    ) {
        val row = sheet.createRow(rowIndex)
        values.forEachIndexed { col, value ->
            val cell = row.createCell(col)
            when (value) {
                null -> cell.setBlank()
                is LocalDate -> cell.setCellValue(value.format(DATE_FMT))
                is Number -> cell.setCellValue(value.toDouble())
                is Boolean -> cell.setCellValue(value)
                else -> cell.setCellValue(value.toString())
            }
        }
    }

    /** Auto-sizes all used columns on [sheet] (call after all rows are written). */
    fun autoSizeColumns(
        sheet: XSSFSheet,
        columnCount: Int,
    ) {
        for (col in 0 until columnCount) {
            sheet.autoSizeColumn(col)
        }
    }

    /** Serialises [wb] to a byte array and closes it. */
    fun toBytes(wb: XSSFWorkbook): ByteArray {
        val baos = ByteArrayOutputStream()
        wb.write(baos)
        wb.close()
        return baos.toByteArray()
    }
}
