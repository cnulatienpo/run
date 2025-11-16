export interface UserProfile {
  id: string;
  name: string;
  color?: string;
  avatarEmoji?: string;
  createdAt: string;
  updatedAt: string;
  isDefault?: boolean;
}
