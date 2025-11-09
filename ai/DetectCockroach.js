// ----------------------------------------------
// --- ไฟล์: DetectCockroach.js (Back-End) ---
// ----------------------------------------------

const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const { TableClient } = require('@azure/data-tables');
const { v4: uuidv4 } = require('uuid');

// --- อ่าน "กุญแจ" จาก Configuration ---
const CUSTOM_VISION_URL = process.env.CUSTOM_VISION_URL;
const CUSTOM_VISION_KEY = process.env.CUSTOM_VISION_KEY;
const STORAGE_CONNECTION_STRING = process.env.STORAGE_CONNECTION_STRING;

// --- ตั้งค่า Client สำหรับ Storage ---
// (เราจะใช้ Connection String เดียวสำหรับทั้ง Blob และ Table)
const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient('uploaded-images'); // ชื่อ Container ที่เราสร้าง
const tableClient = TableClient.fromConnectionString(STORAGE_CONNECTION_STRING, 'DetectionResults'); // ชื่อ Table ที่เราสร้าง

app.http('DetectCockroach', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('HTTP trigger function "DetectCockroach" processing a request.');

        try {
            // --- 0. ตรวจสอบว่ามีกุญแจครบหรือยัง ---
            if (!CUSTOM_VISION_URL || !CUSTOM_VISION_KEY || !STORAGE_CONNECTION_STRING) {
                context.log.error('Server configuration is missing environment variables.');
                return { status: 500, body: 'Server configuration error. Check App Configuration.' };
            }

            // --- 1. รับไฟล์ภาพ (Image) ---
            const imageBuffer = await request.arrayBuffer();
            if (!imageBuffer || imageBuffer.byteLength === 0) {
                return { status: 400, body: 'Please upload an image.' };
            }

            // --- 2. อัปโหลดภาพไปเก็บที่ Azure Blob Storage ---
            const uniqueImageName = `${uuidv4()}.jpg`; // สร้างชื่อไฟล์ใหม่ไม่ซ้ำกัน
            const blockBlobClient = containerClient.getBlockBlobClient(uniqueImageName);

            context.log(`Uploading image: ${uniqueImageName}`);
            await blockBlobClient.upload(imageBuffer, imageBuffer.byteLength);
            const imageUrl = blockBlobClient.url; // URL ของภาพที่อัปโหลด
            context.log(`Image uploaded to: ${imageUrl}`);

            // --- 3. ส่งภาพไปตรวจที่ Custom Vision ---
            context.log('Calling Custom Vision...');
            const visionResponse = await fetch(CUSTOM_VISION_URL, {
                method: 'POST',
                headers: {
                    'Prediction-Key': CUSTOM_VISION_KEY,
                    'Content-Type': 'application/octet-stream', // ส่งเป็น binary
                },
                body: imageBuffer, // ส่ง binary ของภาพไป
            });

            if (!visionResponse.ok) {
                const errorBody = await visionResponse.text();
                context.log.error(`Custom Vision API failed: ${visionResponse.status} ${errorBody}`);
                throw new Error(`Custom Vision API failed with status ${visionResponse.status}`);
            }

            // --- 4. รับผลลัพธ์ JSON กลับมา ---
            const visionResult = await visionResponse.json();
            context.log('Received results from Custom Vision.');

            // --- 5. บันทึกผลลัพธ์ลง Azure Table Storage ---
            const partitionKey = 'Detection'; // จัดกลุ่มผลลัพธ์
            const rowKey = uuidv4(); // ID ของผลลัพธ์นี้

            const detectionEntity = {
                partitionKey: partitionKey,
                rowKey: rowKey,
                imageUrl: imageUrl,
                timestamp: new Date().toISOString(),
                predictions: JSON.stringify(visionResult.predictions || []), // แปลง JSON เป็น String
            };
            
            await tableClient.createEntity(detectionEntity);
            context.log(`Result saved to Table Storage (RowKey: ${rowKey})`);

            // --- 6. ส่งผลลัพธ์ JSON กลับไปให้ Front-End ---
            return {
                status: 200,
                jsonBody: visionResult, // ส่งผลลัพธ์จาก Custom Vision กลับไปตรงๆ
            };

        } catch (error) {
            context.log.error(error);
            return {
                status: 500,
                body: `An error occurred: ${error.message}`,
            };
        }
    },
});