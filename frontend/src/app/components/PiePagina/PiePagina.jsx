'use client';

export default function PiePagina() {
  return (
    <footer
      className="absolute bottom-0 left-0 w-full text-center py-3 text-gray-700 text-sm bg-white shadow-inner z-50"
    >
      Perú © {new Date().getFullYear()} <strong>MoraPack</strong> v5.0
    </footer>
  );
}
