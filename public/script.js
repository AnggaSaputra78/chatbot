document.querySelector("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("user-input");
  const message = input.value.trim();
  if (!message) return;

  // Tampilkan pesan pengguna
  const chatContainer = document.getElementById("chat-container");
  chatContainer.innerHTML += `<div class="user-message">Kamu: ${message}</div>`;
  chatContainer.innerHTML += `<div class="bot-message">Bot sedang mengetik...</div>`;

  input.value = "";

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    const lastMsg = document.querySelector(".bot-message:last-child");
    lastMsg.innerHTML = `Bot: ${data.reply}`;
  } catch (error) {
    console.error("Gagal:", error);
    chatContainer.innerHTML += `<div class="bot-message">Bot error!</div>`;
  }
}); 
async function sendMessage() {
  const input = document.getElementById('user-input');
  const message = input.value.trim();

  if (!message) return;

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });

  const data = await response.json();
  document.getElementById('chat-box').innerHTML += `
    <div class="bot-message">${data.reply}</div>
  `;
}