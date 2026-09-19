// Utilitários para trabalhar com os pedaços (Blob) que o MediaRecorder entrega.

export async function lerBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
}

// Junta vários Blobs numa única Uint8Array (cópia).
export async function juntarBlobs(blobs) {
    const partes = await Promise.all(blobs.map(lerBytes));
    const total = partes.reduce((soma, p) => soma + p.length, 0);
    const resultado = new Uint8Array(total);
    let deslocamento = 0;
    partes.forEach(p => { resultado.set(p, deslocamento); deslocamento += p.length; });
    return resultado;
}
