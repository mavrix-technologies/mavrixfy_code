#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MavrixfyYouTube, NSObject)
RCT_EXTERN_METHOD(search:(NSString *)query filter:(NSString *)filter requestId:(NSString *)requestId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(playlist:(NSString *)playlistId cursor:(NSString *)cursor requestId:(NSString *)requestId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(resolveStream:(NSString *)videoId quality:(NSString *)quality requestId:(NSString *)requestId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(related:(NSString *)videoId requestId:(NSString *)requestId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancel:(NSString *)requestId)
RCT_EXTERN_METHOD(rejectStream:(NSString *)resolutionId)
@end
