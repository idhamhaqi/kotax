// Toast notification system - uses inline styles (no Tailwind dependency)
function showToast(message, type = 'success') {
    const colors = {
        success: { bg: 'linear-gradient(135deg, #10b981, #059669)', icon: 'check-circle' },
        error:   { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', icon: 'exclamation-circle' },
        info:    { bg: 'linear-gradient(135deg, #3b82f6, #2563eb)', icon: 'info-circle' },
        warning: { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', icon: 'exclamation-triangle' }
    };

    const config = colors[type] || colors.success;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${config.bg};
        color: white;
        padding: 14px 20px;
        border-radius: 12px;
        margin-bottom: 10px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        font-size: 14px;
        font-weight: 500;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
    `;
    toast.innerHTML = `
        <i class="fas fa-${config.icon}" style="font-size:18px;flex-shrink:0"></i>
        <span style="flex:1">${message}</span>
        <button onclick="this.parentElement.style.transform='translateX(120%)';this.parentElement.style.opacity='0';setTimeout(()=>this.parentElement.remove(),300)" style="background:rgba(255,255,255,0.2);border:none;color:white;width:24px;height:24px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-times" style="font-size:12px"></i>
        </button>
    `;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;pointer-events:none;';
        document.body.appendChild(container);
    }
    container.appendChild(toast);

    // Slide in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });
    });

    // Auto dismiss after 4 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 4000);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast };
}
