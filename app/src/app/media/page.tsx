import { redirect } from 'next/navigation';

/** Media now lives in the stage (`mode=media`); the old page forwards there so links keep working. */
export default function MediaPage() {
  redirect('/?mode=media#explore');
}
