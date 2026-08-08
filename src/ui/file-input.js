export function isSupportedImage(file) {
  return Boolean(
    file &&
      (file.type.startsWith("image/") || /\.(?:png|jpe?g|webp)$/i.test(file.name ?? "")),
  );
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("read")));
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", () => reject(new Error("decode")));
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });
}

export function bindFileInput({ input, dropZone, changeButton, onFile }) {
  const openPicker = () => input.click();

  dropZone.addEventListener("click", openPicker);
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPicker();
  });
  changeButton.addEventListener("click", openPicker);
  input.addEventListener("change", (event) => {
    if (event.target.files[0]) onFile(event.target.files[0]);
    event.target.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag");
    if (event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]);
  });
}
