declare module 'qrcode' {
  const qrcode: {
    create(text: string, options?: { errorCorrectionLevel?: string }): Promise<{
      modules: { size: number, get(x: number, y: number): boolean }
    }>
  };
  export = qrcode;
}
