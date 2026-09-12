package expo.modules.ioubackupdocuments

import android.net.Uri
import android.provider.DocumentsContract
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Accesses paired document identities and owned streams using the existing tree grant. */
class IouBackupDocumentsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("IouBackupDocuments")
    // Expo's default AsyncFunction worker queue keeps provider I/O off JS and UI.
    AsyncFunction("listDirectory") { value: String ->
      try {
        val tree = Uri.parse(value)
        val segments = tree.pathSegments
        if (tree.scheme != "content" || tree.authority.isNullOrEmpty() || !DocumentsContract.isTreeUri(tree) ||
          !(segments.size == 2 || (segments.size == 4 && segments[2] == "document"))) {
          throw IllegalArgumentException()
        }
        // A tree/document URI can target a directory below the granted root.
        val directoryId = if (segments.size == 4) DocumentsContract.getDocumentId(tree)
          else DocumentsContract.getTreeDocumentId(tree)
        if (directoryId.isEmpty()) throw IllegalArgumentException()
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, directoryId)
        val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException()
        val projection = arrayOf(
          DocumentsContract.Document.COLUMN_DOCUMENT_ID,
          DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          DocumentsContract.Document.COLUMN_MIME_TYPE
        )
        val cursor = resolver.query(children, projection, null, null, null) ?: throw IllegalStateException()
        cursor.use {
          // Cloud providers may return an incomplete cursor while fetching rows.
          // Never treat that state as an empty folder or overwrite unseen files.
          if (it.extras.getBoolean(DocumentsContract.EXTRA_LOADING, false) ||
            it.extras.getString(DocumentsContract.EXTRA_ERROR) != null) throw IllegalStateException()
          val idColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          val mimeColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
          val entries = mutableListOf<Map<String, Any>>()
          while (it.moveToNext()) {
            val id = it.getString(idColumn)?.takeIf(String::isNotEmpty) ?: throw IllegalStateException()
            val name = it.getString(nameColumn)?.takeIf(String::isNotEmpty) ?: throw IllegalStateException()
            val mime = it.getString(mimeColumn)?.takeIf(String::isNotEmpty) ?: throw IllegalStateException()
            if (entries.size >= 10_000) throw IllegalStateException()
            entries.add(mapOf(
              "uri" to DocumentsContract.buildDocumentUriUsingTree(tree, id).toString(),
              "name" to name,
              "isDirectory" to (mime == DocumentsContract.Document.MIME_TYPE_DIR)
            ))
          }
          entries
        }
      } catch (_: Exception) {
        // Provider exceptions can contain private URIs/names. Never attach them.
        throw CodedException("ERR_BACKUP_DOCUMENTS_LIST", "Unable to read backup folder metadata", null)
      }
    }
    AsyncFunction("writeText") { value: String, text: String ->
      try {
        val document = Uri.parse(value)
        val segments = document.pathSegments
        if (value.length > 16_384 || document.scheme != "content" || document.authority.isNullOrEmpty() ||
          document.authority!!.contains('@') || document.query != null || document.fragment != null ||
          !DocumentsContract.isTreeUri(document) || segments.size != 4 || segments[0] != "tree" ||
          segments[2] != "document" || value.endsWith('/') ||
          DocumentsContract.getTreeDocumentId(document).isEmpty() || DocumentsContract.getDocumentId(document).isEmpty() ||
          segments.any { it.contains('\u0000') }) throw IllegalArgumentException()
        val resolver = appContext.reactContext?.contentResolver ?: throw IllegalStateException()
        // This stream owns its ParcelFileDescriptor. Closing it sends EOF and
        // releases the provider handle before JS verifies the contents.
        // A channel around a borrowed descriptor cannot provide that guarantee.
        val output = resolver.openOutputStream(document, "wt") ?: throw IllegalStateException()
        output.use { it.write(text.toByteArray(Charsets.UTF_8)) }
      } catch (_: Exception) {
        throw CodedException("ERR_BACKUP_DOCUMENTS_WRITE", "Unable to write backup document", null)
      }
    }
  }
}
