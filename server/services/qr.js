import QRCode from "qrcode";

export async function makeDownloadQr(downloadUrl) {
  const dataUrl = await QRCode.toDataURL(downloadUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: {
      dark: "#142018",
      light: "#ffffff",
    },
  });
  return dataUrl;
}
