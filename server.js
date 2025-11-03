import express from "express";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("./public"));

// ==============================
// ✅ PostgreSQL（Fly.io）
// ==============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

// ==============================
// ✅ チャット系のデバッグログ
// ==============================
app.use((req, res, next) => {
  if (req.path.startsWith("/api/messages")) {
    console.log("📩 API:", req.method, req.path, "query=", req.query, "body=", req.body);
  }
  next();
});

// ==============================
// 🚚 ドライバー一覧
// ==============================
app.get("/api/drivers", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT name FROM driver_list WHERE active = TRUE ORDER BY id ASC"
    );
    res.json(result.rows.map(r => r.name.trim()));
  } catch (err) {
    console.error("❌ /api/drivers error:", err);
    res.status(500).json({ error: "Failed to fetch drivers" });
  }
});



// ==============================
// 📅 スケジュール取得
// ==============================
app.get("/api/schedule", async (req, res) => {
  const driver = (req.query.driver || "").trim();
  try {
    const result = await pool.query(
      "SELECT * FROM schedule WHERE TRIM(driver)=$1 ORDER BY date ASC",
      [driver]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ /api/schedule error:", err);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
});

// ==============================
// 📝 スケジュール登録 / 更新
// ==============================
app.post("/api/schedule", async (req, res) => {
  let { driver, date, destination, cargo, truck_number, company_message } = req.body;
  driver = (driver || "").trim();

  try {
    const exists = await pool.query(
      "SELECT id FROM schedule WHERE TRIM(driver)=$1 AND date=$2",
      [driver, date]
    );

    if (exists.rows.length > 0) {
      await pool.query(
        `UPDATE schedule SET destination=$1, cargo=$2, truck_number=$3, company_message=$4
         WHERE TRIM(driver)=$5 AND date=$6`,
        [destination, cargo, truck_number, company_message, driver, date]
      );
      res.json({ message: "Schedule updated" });
    } else {
      await pool.query(
        `INSERT INTO schedule (driver, date, destination, cargo, truck_number, company_message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [driver, date, destination, cargo, truck_number, company_message]
      );
      res.json({ message: "Schedule created" });
    }
  } catch (err) {
    console.error("❌ /api/schedule POST error:", err);
    res.status(500).json({ error: "Failed to save schedule" });
  }
});

// ==============================
// 💬 チャット一覧取得
// ==============================
app.get("/api/messages", async (req, res) => {
  const driver = (req.query.driver || "").trim();
  try {
    const result = await pool.query(
      `SELECT driver, role, message, timestamp 
       FROM messages 
       WHERE TRIM(driver)=TRIM($1)
       ORDER BY timestamp ASC`,
      [driver]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ /api/messages GET error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// ==============================
// ✉️ チャット送信
// ==============================
app.post("/api/messages", async (req, res) => {
  let { driver, role, message } = req.body;

  driver = (driver || "").trim();
  role = (role || "").trim();
  message = (message || "").trim();

  if (!driver || !role || !message) {
    return res.status(400).json({ error: "driver / role / message required" });
  }

  try {
    await pool.query(
      `INSERT INTO messages (driver, role, message, timestamp, read_flag)
       VALUES ($1,$2,$3,NOW(),FALSE)`,
      [driver, role, message]
    );
    res.json({ message: "Message sent" });
  } catch (err) {
    console.error("❌ /api/messages POST error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ==============================
// 📜 履歴
// ==============================
app.get("/api/history", async (req, res) => {
  const driver = (req.query.driver || "").trim();
  try {
    const result = await pool.query(
      `SELECT date, destination, cargo, truck_number, company_message
       FROM schedule WHERE TRIM(driver)=$1 ORDER BY date DESC`,
      [driver]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ /api/history error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ==============================
// ❌ ドライバー削除
// ==============================
app.post("/api/drivers/delete", async (req, res) => {
  const name = (req.body.name || "").trim();
  try {
    await pool.query("UPDATE driver_list SET active = FALSE WHERE TRIM(name)=$1", [name]);
    await pool.query("DELETE FROM schedule WHERE TRIM(driver)=$1", [name]);
    await pool.query("DELETE FROM messages WHERE TRIM(driver)=$1", [name]);
    res.json({ message: `${name} を削除しました` });
  } catch (err) {
    console.error("❌ /api/drivers/delete error:", err);
    res.status(500).json({ error: "Failed to delete driver" });
  }
});

// ==============================
// ➕ 新規ドライバー登録
// ==============================
app.post("/api/drivers/add", async (req, res) => {
  let { name, phone, address } = req.body;
  name = (name || "").trim();
  try {
    await pool.query(
      "INSERT INTO driver_list (name, phone, address, active) VALUES ($1,$2,$3, TRUE)",
      [name, phone, address]
    );
    res.json({ message: "登録しました" });
  } catch (err) {
    console.error("❌ /api/drivers/add error:", err);
    res.status(500).json({ error: "Failed to register driver" });
  }
});

// ==============================
// 🚀 サーバー起動
// ==============================
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on ${PORT}`);
});
app.get("/api/drivers/detail", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT name, phone, address FROM driver_list WHERE active = TRUE ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ /api/drivers/detail error:", err);
    res.status(500).json({ error: "Failed to fetch drivers detail" });
  }
});
