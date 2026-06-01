/**
 * GAS API BRIDGE
 * Ubah 'GAS_URL' dengan URL Web App setelah Deploy di Google Apps Script
 */

const GAS_URL = "PASTE_YOUR_GAS_WEBAPP_URL_HERE";

export const api = {
  async request(action, data = {}) {
    if (GAS_URL.includes("PASTE_YOUR")) {
      console.warn("GAS URL belum diatur di js/api.js");
      return null;
    }

    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        mode: "no-cors", // Penting untuk GAS jika tidak menggunakan lib khusus, namun json return sulit dibaca.
        // Disarankan menggunakan standar fetch biasa jika GAS sudah return JSON yang benar.
        body: JSON.stringify({ action, data }),
      });

      // Catatan: Google Apps Script sering return 401/302 jika CORS belum benar.
      // Gunakan redirect secara manual jika perlu.
      const result = await response.json();
      if (result.status === "error") throw new Error(result.message);
      return result.data;
    } catch (error) {
      console.error("API Fetch Error:", error);
      throw error;
    }
  },

  // Shortcut khusus untuk POST yang butuh return data cepat
  async send(action, data) {
    const res = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({ action, data }),
    });
    return await res.json();
  },
};
