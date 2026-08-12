// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function maskBankAccount(accNo) {
    if (!accNo) return '-';
    const str = String(accNo).trim();
    if (str.length <= 4) return str;
    const last4 = str.slice(-4);
    const prefix = str.length >= 7 ? str.slice(0, 3) : str.slice(0, 2);
    return `${prefix}*****${last4}`;
}

// Load profile data
async function loadProfile() {
    try {
        const response = await fetch('/api/profile/data');
        const result = await response.json();

        if (result.success) {
            const { profile } = result;
            const maskedAccount = maskBankAccount(profile.bankAccountNumber);

            // Desktop
            setText('fullNameDesktop', profile.fullName);
            setText('emailDesktop', profile.email);
            setText('bankNameDesktop', profile.bankName);
            setText('bankAccountDesktop', maskedAccount);
            setText('referralCodeDesktop', profile.referralCode);
            setText('memberSinceDesktop', formatDate(profile.memberSince));
            
            // Mobile
            setText('fullNameMobile', profile.fullName);
            setText('emailMobile', profile.email);
            setText('bankNameMobile', profile.bankName);
            setText('bankAccountMobile', maskedAccount);
            setText('referralCodeMobile', profile.referralCode);
            setText('memberSinceMobile', formatDate(profile.memberSince));
            
            // Render PIN status
            if (profile.hasPin) {
                document.getElementById('setPinFormMobile')?.classList.add('hidden');
                document.getElementById('pinStatusActiveMobile')?.classList.remove('hidden');
                
                document.getElementById('setPinFormDesktop')?.classList.add('hidden');
                document.getElementById('pinStatusActiveDesktop')?.classList.remove('hidden');
            } else {
                document.getElementById('setPinFormMobile')?.classList.remove('hidden');
                document.getElementById('pinStatusActiveMobile')?.classList.add('hidden');
                
                document.getElementById('setPinFormDesktop')?.classList.remove('hidden');
                document.getElementById('pinStatusActiveDesktop')?.classList.add('hidden');
            }

            // Initials Avatar
            const nameParts = profile.fullName.split(' ');
            const initials = nameParts.length > 1 
                ? (nameParts[0][0] + nameParts[1][0]).toUpperCase() 
                : nameParts[0].substring(0, 2).toUpperCase();
            setText('avatarMobile', initials);
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Handle PIN form submission
const setupPinForm = (formId) => {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {
            pin: formData.get('pin'),
            confirmPin: formData.get('confirmPin'),
            password: formData.get('password')
        };

        try {
            const response = await fetch('/api/profile/set-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (result.success) {
                showToast(result.message, 'success');
                loadProfile();
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast('Terjadi kesalahan koneksi', 'error');
        }
    });
};

// Handle change password form
document.addEventListener('DOMContentLoaded', () => {
    setupPinForm('setPinFormMobile');
    setupPinForm('setPinFormDesktop');

    const setupForm = (formId) => {
        const form = document.getElementById(formId);
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const data = {
                currentPassword: formData.get('currentPassword'),
                newPassword: formData.get('newPassword'),
                repeatPassword: formData.get('repeatPassword')
            };

            try {
                const response = await fetch('/api/profile/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    showToast(result.message, 'success');
                    form.reset();
                } else {
                    showToast(result.message, 'error');
                }
            } catch (error) {
                showToast('Terjadi kesalahan', 'error');
            }
        });
    };

    setupForm('changePasswordFormDesktop');
    setupForm('changePasswordFormMobile');
});

// Initialize
loadProfile();
