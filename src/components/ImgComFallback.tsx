"use client";

import { useState } from "react";

interface Props {
  src?: string | null;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  loading?: "lazy" | "eager";
  fallback: React.ReactNode;
}

// <img> com fallback pra quando não tem imagem_url OU quando tem mas o
// arquivo não carrega (link quebrado — ex: provedor externo fora do ar).
// Sem isso, uma URL presente mas inválida mostra o ícone feio padrão do
// navegador em vez do placeholder já desenhado pra "sem imagem".
export default function ImgComFallback({ src, alt, style, className, loading, fallback }: Props) {
  const [erro, setErro] = useState(false);

  if (!src || erro) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={style}
      className={className}
      loading={loading}
      onError={() => setErro(true)}
    />
  );
}
