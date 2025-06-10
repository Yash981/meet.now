export const encodeBinaryMessage = (data: string): Uint8Array => {
    return new TextEncoder().encode(data);
  };
  
export const decodeBinaryMessage = (binary:any): string => {
    const uint8 =
    binary instanceof Buffer
      ? new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength)
      : binary instanceof ArrayBuffer
      ? new Uint8Array(binary)
      : typeof binary === "string"
      ? new TextEncoder().encode(binary) 
      : new Uint8Array();
    return new TextDecoder().decode(uint8);
};
  