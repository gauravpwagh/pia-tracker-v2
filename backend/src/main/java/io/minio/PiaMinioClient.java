package io.minio;

import io.minio.errors.ErrorResponseException;
import io.minio.errors.InsufficientDataException;
import io.minio.errors.InternalException;
import io.minio.errors.InvalidResponseException;
import io.minio.errors.ServerException;
import io.minio.errors.XmlParserException;
import io.minio.messages.Part;

import java.io.IOException;
import java.lang.reflect.Method;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;

/**
 * Promotes S3Base's protected multipart lifecycle methods to public.
 * Uses reflection because javac disallows calling the protected methods
 * even from a same-package subclass due to how null Multimap args are resolved.
 */
public class PiaMinioClient extends MinioClient {

    private static final Method CREATE_MULTIPART;
    private static final Method COMPLETE_MULTIPART;

    static {
        try {
            Class<?> s3Base = Class.forName("io.minio.S3Base");
            Class<?> multimapClass = Class.forName("com.google.common.collect.Multimap");
            CREATE_MULTIPART = s3Base.getDeclaredMethod(
                    "createMultipartUpload", String.class, String.class, String.class,
                    multimapClass, multimapClass);
            CREATE_MULTIPART.setAccessible(true);
            COMPLETE_MULTIPART = s3Base.getDeclaredMethod(
                    "completeMultipartUpload", String.class, String.class, String.class,
                    String.class, Part[].class, multimapClass, multimapClass);
            COMPLETE_MULTIPART.setAccessible(true);
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    public PiaMinioClient(MinioClient base) {
        super(base);
    }

    public String piaCreateMultipartUpload(String bucket, String objectKey)
            throws Exception {
        CreateMultipartUploadResponse response =
                (CreateMultipartUploadResponse) CREATE_MULTIPART.invoke(this, bucket, null, objectKey, null, null);
        return response.result().uploadId();
    }

    public void piaCompleteMultipartUpload(String bucket, String objectKey, String uploadId, Part[] parts)
            throws Exception {
        COMPLETE_MULTIPART.invoke(this, bucket, null, objectKey, uploadId, parts, null, null);
    }
}
