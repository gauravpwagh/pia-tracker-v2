package `in`.gov.ir.pia.attachment

/**
 * Central registry of allowed upload content types and their scan policy.
 *
 * ScanPolicy.REQUIRED  — file must pass ClamAV before being marked CLEAN.
 * ScanPolicy.EXEMPT    — file is too large to scan in real time (drone video);
 *                        SHA-256 is stored for integrity, status set to EXEMPT.
 */
object AllowedContentTypes {
    enum class ScanPolicy { REQUIRED, EXEMPT }

    val DOCUMENT =
        setOf(
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    val IMAGE =
        setOf(
            "image/jpeg",
            "image/png",
            "image/tiff",
            "image/geo+tiff",
            "image/geotiff",
        )

    val GEOGRAPHIC =
        setOf(
            "application/vnd.google-earth.kmz",
            "application/vnd.google-earth.kml+xml",
            "application/zip", // shapefiles, DGPS exports
            "application/x-zip-compressed",
            "application/gpx+xml",
            "text/csv",
            "text/plain", // .las, .xyz survey text exports
        )

    val VIDEO =
        setOf(
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/x-msvideo",
            "video/mpeg",
        )

    val ALL: Set<String> = DOCUMENT + IMAGE + GEOGRAPHIC + VIDEO

    fun scanPolicy(contentType: String): ScanPolicy = if (contentType in VIDEO) ScanPolicy.EXEMPT else ScanPolicy.REQUIRED
}
