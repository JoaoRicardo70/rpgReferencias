import React from 'react';
import CompendioRegistro from './CompendioRegistro';
import { CompendioFormProvider, useCompendioForm } from './CompendioFormContext';
import { 
    CompendioSidebar, 
    CompendioClassesGrid, 
    CompendioGrandsSecao,
    CompendioCondicoes,   // 🔥 IMPORTAÇÕES DAS NOVAS TELAS
    CompendioElementos,
    CompendioRegras
} from './CompendioSubComponents';

function CompendioAreaCentral() {
    const ctx = useCompendioForm();
    if (!ctx) return null;
    
    if (ctx.secaoAtiva === 'grands') return <CompendioGrandsSecao />;
    if (ctx.secaoAtiva === 'classes') return <CompendioClassesGrid />;
    if (ctx.secaoAtiva === 'condicoes') return <CompendioCondicoes />;
    if (ctx.secaoAtiva === 'elementos') return <CompendioElementos />;
    if (ctx.secaoAtiva === 'regras') return <CompendioRegras />;
    if (ctx.secaoAtiva === 'registro') return <CompendioRegistro />;
    
    return null;
}

export default function CompendioPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <CompendioFormProvider>
            <div className={['compendio-panel', className].filter(Boolean).join(' ')} style={{ display: 'flex', gap: '20px', minHeight: '70vh', alignItems: 'flex-start' }}>
                {hasChildren ? children : (
                    <>
                        <CompendioSidebar />
                        <div style={{ flex: '1', background: 'rgba(20, 20, 30, 0.8)', padding: '30px', borderRadius: '8px', border: '1px solid #444', height: '70vh', overflowY: 'auto' }}>
                            <CompendioAreaCentral />
                        </div>
                    </>
                )}
            </div>
        </CompendioFormProvider>
    );
}