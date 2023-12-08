const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const server = http.createServer(app);

//CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
  },
});

const port = 3001;

//BASE DE DATOS
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "chat",
  password: "123",
  port: 5432,
});

app.use(cors());
app.use(bodyParser.json());

// Método para guardar un mensaje en la base de datos
const saveMessage = async (message) => {
  const { de, para, mensaje } = message;

  try {
    const result = await pool.query(
      "INSERT INTO messages (para, de, mensaje) VALUES ($1, $2, $3) RETURNING *",
      [de, para, mensaje]
    );

    console.log("Mensaje guardado en la base de datos:", result.rows[0]);
  } catch (error) {
    console.error("Error al guardar el mensaje en la base de datos:", error);
  }
};

module.exports = { saveMessage };

const usuariosConectados = new Set();
const obtenerListaDeUsuarios = (usuarioActual) => {
  return Array.from(usuariosConectados).filter(
    (usuario) => usuario !== usuarioActual
  );
};

//REGISTRO DE USUARIOS
app.post("/register", async (req, res) => {
  const { username, realName } = req.body;

  try {
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE user_name = $1",
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(200).json({ ms: "INGRESO CORRECTAMENTE." });
    }

    const result = await pool.query(
      "INSERT INTO users (user_name, name) VALUES ($1, $2) RETURNING *",
      [username, realName]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error al registrar usuario", error);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

//OBTENER LISTADO DE USUARIOS
app.get("/users", async (req, res) => {
  try {
    // Realiza la consulta a la base de datos
    const result = await pool.query("SELECT * FROM users");

    // Envia la respuesta en formato JSON
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

app.get("/usersall", async (req, res) => {
  try {
    const result = await pool.query("SELECT user_name FROM users");
    const users = result.rows.map((row) => row.user_name);
    res.json(users);
  } catch (error) {
    console.error("Error al obtener la lista de usuarios:", error);
    res.status(500).json({ error: "Error al obtener la lista de usuarios" });
  }
});

//SOCKET
io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("sendMessage", async (message) => {
    // Guarda el mensaje en la base de datos
    console.log("Mensaje recibido en el servidor:", message);
    await saveMessage(message);

    // Emitir el mensaje a todos los usuarios conectados (si es necesario)
    io.emit("newMessage", message);
  });

  socket.on("getStoredMessages", async (selectedUser, username) => {
    // Recupera los mensajes almacenados en la base de datos para este usuario
    const storedMessages = await pool.query(
      "SELECT * FROM messages WHERE (para = $1 AND de = $2) OR (para = $2 AND de = $1)",
      [selectedUser, username]
    );
    console.log(storedMessages.rows);
    // EMITIMOS LOS MENSAJES ALMACENADOS AL CLIENTE
    socket.emit("storedMessages", storedMessages.rows);
    //DEVOLVEMOS MENSAJE POR MENSAJE
    storedMessages.rows.forEach((message) => {
      io.emit("newMessage", message);
    });
  });

  socket.on("userConnected", async (username) => {
    // RECUPERAR LOS MENSAJES
    const storedMessages = await pool.query(
      "SELECT * FROM messages WHERE para = $1",
      [username]
    );

    usuariosConectados.add(username);
    io.emit("userConnected", obtenerListaDeUsuarios(username));
  });

  socket.on("userDisconnected", (username) => {
    usuariosConectados.delete(username);
    io.emit("userConnected", obtenerListaDeUsuarios(username));
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
