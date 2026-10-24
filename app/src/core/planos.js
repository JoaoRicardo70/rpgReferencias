// ==========================================
// 🌌 MAPA DOS PLANOS (components/mapa/MapaMundi.jsx, tela "Cosmologia")
// Nome do plano -> identificador de classe CSS (sem acento/espaço): "Plano da Água" -> "plano-da-agua".
// ==========================================

export function slugDoPlano(nome) {
    return String(nome || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// "Terra 0 (Runeterra)" -> "Terra 0\n(Runeterra)" (o rótulo quebra a linha antes do parêntese).
export function rotuloDoPlano(nome) {
    return String(nome || '').replace(' (', '\n(');
}
