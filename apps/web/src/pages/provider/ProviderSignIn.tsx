// P23 Provider sign in and two-step sign-in (M4 chunk 15b, BP-8, brief 22.6). The same flow as C26, ending at /provider.
import { TwoFactorSignIn, type SignInCopy } from '../client/SignIn';

const copy: SignInCopy = {
  title: 'provider.signin.title',
  demoOnly: 'provider.signin.demoOnly',
  email: 'provider.signin.email',
  password: 'provider.signin.password',
  signIn: 'provider.signin.submit',
  intro: 'provider.signin.intro',
  code: 'provider.signin.code',
  confirm: 'provider.signin.confirm',
  useRecovery: 'provider.signin.useRecovery',
  useAppCode: 'provider.signin.useAppCode',
  recoveryLabel: 'provider.signin.recoveryLabel',
  wrong: 'provider.signin.wrong',
  locked: 'provider.signin.locked',
};

export function ProviderSignIn() {
  return <TwoFactorSignIn destination="/provider" copy={copy} />;
}
