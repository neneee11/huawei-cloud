// --- ‼️ สำคัญมาก: ใส่ URL ของคุณตรงนี้ ‼️ ---
const FUNCTION_URL = 'YOUR_AZURE_FUNCTION_URL_HERE'; 

// --- ผูกตัวแปรกับ HTML ---
const uploader = document.getElementById('imageUploader');
const previewImage = document.getElementById('previewImage');
const canvas = document.getElementById('detectionCanvas');
const context = canvas.getContext('2d');
const loader = document.getElementById('loader');
const resultText = document.getElementById('detectionResult');

// --- เมื่อผู้ใช้เลือกไฟล์ ---
uploader.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 1. แสดงภาพตัวอย่าง
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.onload = () => {
            // ปรับขนาด Canvas ให้เท่ากับภาพที่แสดงผล
            canvas.width = previewImage.clientWidth;
            canvas.height = previewImage.clientHeight;
        };
    };
    reader.readAsDataURL(file);

    // 2. เรียกฟังก์ชันวิเคราะห์ภาพ
    analyzeImage(file);
});

async function analyzeImage(file) {
    // 3. แสดงตัวหมุนๆ, ซ่อนผลลัพธ์เก่า
    loader.style.display = 'block';
    resultText.innerText = '';
    context.clearRect(0, 0, canvas.width, canvas.height); // ล้างกรอบเก่า

    try {
        // 4. ส่งภาพไปที่ Back-End API (Azure Function)
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream' // ส่งเป็น binary
            },
            body: file // ส่งไฟล์ภาพไปตรงๆ
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API failed: ${response.status} ${errorText}`);
        }

        // 5. รับผลลัพธ์ JSON กลับมา
        const result = await response.json();
        
        // 6. แสดงผลลัพธ์
        loader.style.display = 'none';
        resultText.innerText = JSON.stringify(result, null, 2); // แสดง JSON สวยๆ

        // 7. วาดกรอบสี่เหลี่ยม
        drawBoundingBoxes(result.predictions);

    } catch (error) {
        loader.style.display = 'none';
        resultText.innerText = `Error: ${error.message}`;
        console.error(error);
    }
}

function drawBoundingBoxes(predictions) {
    if (!predictions || predictions.length === 0) {
        console.log('No predictions to draw.');
        return;
    }

    // ปรับขนาด Canvas ให้เท่ากับภาพที่แสดงผล (อีกครั้ง เผื่อไว้)
    const imgWidth = previewImage.clientWidth;
    const imgHeight = previewImage.clientHeight;
    canvas.width = imgWidth;
    canvas.height = imgHeight;

    predictions.forEach(pred => {
        // วาดเฉพาะ Tag ที่เราสนใจ (เช่น 'cockroach') และมั่นใจ > 50%
        if (pred.tagName === 'cockroach' && pred.probability > 0.5) { 
            // Custom Vision ส่งค่ามาเป็น % (0.0 ถึง 1.0)
            const box = pred.boundingBox;
            const x = box.left * imgWidth;
            const y = box.top * imgHeight;
            const width = box.width * imgWidth;
            const height = box.height * imgHeight;

            // วาดกรอบ
            context.strokeStyle = 'red';
            context.lineWidth = 3;
            context.beginPath();
            context.rect(x, y, width, height);
            context.stroke();

            // วาดป้ายชื่อ
            context.fillStyle = 'red';
            context.font = '16px Arial';
            const label = `${pred.tagName} (${Math.round(pred.probability * 100)}%)`;
            context.fillText(label, x, y > 10 ? y - 5 : 10);
        }
    });
}