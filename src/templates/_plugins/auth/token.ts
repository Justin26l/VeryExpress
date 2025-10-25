// {{headerComment}}
import { generateToken } from "./../auth/jwt.gen";
import { UserDocument } from "./../../_models/UserModel.gen";

export default function returnToken(userProfile: UserDocument){
    const sanitizedProfile = sanitizeUser(userProfile);
    const accessToken = generateToken(sanitizedProfile, undefined, process.env.ACCESS_TOKEN_EXPIRE_TIME);
    const refreshToken = generateToken({_id: userProfile._id }, 0, process.env.REFRESH_TOKEN_EXPIRE_TIME);

    return {
        profile: sanitizedProfile, 
        accessToken: accessToken.token,
        accessTokenIndex: accessToken.index,
        clientIndex: accessToken.clientIndex,
        refreshToken: refreshToken.token
    };
}

export function sanitizeUser(user: UserDocument){
    return {
        _id: user._id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles: user.roles,
        profileErrors: user.profileErrors,
        active: user.active
    };
}