import React from 'react';
import { ElementosFormProvider } from './ElementosFormContext';
import EnsinamentosRecebidos from '../shared/EnsinamentosRecebidos';
import { ElementosNavegacaoLivro, ElementosGrimorio, ElementosFormMagia, ElementosMagiaLista, ElementosImportadorIA } from './ElementosSubComponents';

export default function ElementosPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <ElementosFormProvider>
            <div className={['elementos-panel', className].filter(Boolean).join(' ')} style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                {hasChildren ? children : (
                    <>
                        <EnsinamentosRecebidos tipo="tecnica" />
                        <ElementosImportadorIA />
                        {/* 🔥 A NAVEGAÇÃO DE PÁGINAS ENTROU AQUI! 🔥 */}
                        <ElementosNavegacaoLivro />
                        <ElementosGrimorio />
                        <ElementosFormMagia />
                        <ElementosMagiaLista />
                    </>
                )}
            </div>
        </ElementosFormProvider>
    );
}