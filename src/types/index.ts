export interface FollowerProfile {
  id?: string;
  username: string;
  displayName?: string;
  profileUrl: string;
}

export interface TokenMetadataInput {
  name: string;
  symbol: string;
  description: string;
  logoUrl: string;
  followerProfileUrl: string;
}

export interface UploadedMetadata {
  metadataUri: string;
  image: string;
}

export interface PumpfunLaunchResult {
  mintAddress: string;
  pumpfunUrl: string;
  txSignature: string;
  metadataUri: string;
}
